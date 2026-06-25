"use client";

import { useEffect, useMemo, useState } from "react";
import type { Apartment, ComparableApartment, ComparableRule } from "@/types/apartment";
import type { InventorySignal, Listing } from "@/types/listing";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { defaultComparableRule, defaultModelWeights } from "./seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "./storage";
import { dbGet, dbSave } from "./dbClient";

// ── 모듈 레벨 캐시 싱글톤 ──────────────────────────────────────────
// 클라이언트 사이드 내비게이션 시 재마운트돼도 DB 재조회 없이 즉시 반환
type StoreSnapshot = {
  apartments: Apartment[];
  comparableRules: ComparableRule[];
  comparableApartments: ComparableApartment[];
  transactions: Transaction[];
  listings: Listing[];
  inventorySignals: InventorySignal[];
  priceEstimates: PriceEstimate[];
};

type LoadResult = { snapshot: StoreSnapshot; source: "db" | "local" };

let _cache: StoreSnapshot | null = null;
let _loadPromise: Promise<LoadResult> | null = null;

async function _loadFromSource(): Promise<LoadResult> {
  try {
    const [apts, rules, compApts, txs, lstngs, invSigs, priceEsts] = await Promise.all([
      dbGet<Apartment>("apartments"),
      dbGet<ComparableRule>("comparable_rules"),
      dbGet<ComparableApartment>("comparable_apartments"),
      dbGet<Transaction>("transactions"),
      dbGet<Listing>("listings"),
      dbGet<InventorySignal>("inventory_signals"),
      dbGet<PriceEstimate>("price_estimates"),
    ]);
    return {
      source: "db",
      snapshot: {
        apartments: apts,
        comparableRules: rules.length > 0 ? rules : apts.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id)),
        comparableApartments: compApts,
        transactions: txs,
        listings: lstngs,
        inventorySignals: invSigs,
        priceEstimates: priceEsts,
      },
    };
  } catch {
    const storedApts = readStorage<Apartment[]>(STORAGE_KEYS.apartments, []);
    return {
      source: "local",
      snapshot: {
        apartments: storedApts,
        comparableRules: readStorage<ComparableRule[]>(STORAGE_KEYS.comparableRules, storedApts.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id))),
        comparableApartments: readStorage<ComparableApartment[]>(STORAGE_KEYS.comparableApartments, []),
        transactions: readStorage<Transaction[]>(STORAGE_KEYS.transactions, []),
        listings: readStorage<Listing[]>(STORAGE_KEYS.listings, []),
        inventorySignals: readStorage<InventorySignal[]>(STORAGE_KEYS.inventorySignals, []),
        priceEstimates: readStorage<PriceEstimate[]>(STORAGE_KEYS.priceEstimates, []),
      },
    };
  }
}

function _getOrLoad(): Promise<LoadResult> {
  if (_cache) return Promise.resolve({ snapshot: _cache, source: "db" as const });
  if (!_loadPromise) {
    _loadPromise = _loadFromSource().then((r) => {
      _cache = r.snapshot;
      return r;
    });
  }
  return _loadPromise;
}

// ── Hook ──────────────────────────────────────────────────────────
export function useRealtyStore() {
  // 캐시 있으면 lazy initializer로 즉시 초기화 (재마운트 시 로딩 없음)
  const [apartments, setApartmentsState] = useState<Apartment[]>(() => _cache?.apartments ?? []);
  const [comparableRules, setComparableRulesState] = useState<ComparableRule[]>(() => _cache?.comparableRules ?? []);
  const [comparableApartments, setComparableApartmentsState] = useState<ComparableApartment[]>(() => _cache?.comparableApartments ?? []);
  const [transactions, setTransactionsState] = useState<Transaction[]>(() => _cache?.transactions ?? []);
  const [listings, setListingsState] = useState<Listing[]>(() => _cache?.listings ?? []);
  const [inventorySignals, setInventorySignalsState] = useState<InventorySignal[]>(() => _cache?.inventorySignals ?? []);
  const [priceEstimates, setPriceEstimatesState] = useState<PriceEstimate[]>(() => _cache?.priceEstimates ?? []);
  const [ready, setReady] = useState(() => _cache !== null);
  const [dataSource, setDataSource] = useState<"db" | "local" | null>(() => _cache ? "db" : null);

  function _applySnapshot(s: StoreSnapshot, source: "db" | "local") {
    setApartmentsState(s.apartments);
    setComparableRulesState(s.comparableRules);
    setComparableApartmentsState(s.comparableApartments);
    setTransactionsState(s.transactions);
    setListingsState(s.listings);
    setInventorySignalsState(s.inventorySignals);
    setPriceEstimatesState(s.priceEstimates);
    setReady(true);
    setDataSource(source);
  }

  useEffect(() => {
    if (_cache) return; // 이미 캐시됨 — DB 재조회 불필요
    _getOrLoad().then((r) => _applySnapshot(r.snapshot, r.source));
    if (!readStorage(STORAGE_KEYS.modelSettings, null)) writeStorage(STORAGE_KEYS.modelSettings, defaultModelWeights);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 다른 탭에서 데이터를 변경하면 캐시 무효화 후 재로드
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (!e.key?.startsWith("realty_")) return;
      _cache = null;
      _loadPromise = null;
      _getOrLoad().then((r) => _applySnapshot(r.snapshot, r.source));
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setApartments(next: Apartment[]) {
    if (_cache) _cache.apartments = next;
    setApartmentsState(next);
    dbSave("apartments", next).catch(() => writeStorage(STORAGE_KEYS.apartments, next));
  }
  function setComparableRules(next: ComparableRule[]) {
    if (_cache) _cache.comparableRules = next;
    setComparableRulesState(next);
    dbSave("comparable_rules", next).catch(() => writeStorage(STORAGE_KEYS.comparableRules, next));
  }
  function setComparableApartments(next: ComparableApartment[]) {
    if (_cache) _cache.comparableApartments = next;
    setComparableApartmentsState(next);
    dbSave("comparable_apartments", next).catch(() => writeStorage(STORAGE_KEYS.comparableApartments, next));
  }
  function setTransactions(next: Transaction[]) {
    if (_cache) _cache.transactions = next;
    setTransactionsState(next);
    dbSave("transactions", next).catch(() => writeStorage(STORAGE_KEYS.transactions, next));
  }
  function setListings(next: Listing[]) {
    if (_cache) _cache.listings = next;
    setListingsState(next);
    dbSave("listings", next).catch(() => writeStorage(STORAGE_KEYS.listings, next));
  }
  function setInventorySignals(next: InventorySignal[]) {
    if (_cache) _cache.inventorySignals = next;
    setInventorySignalsState(next);
    dbSave("inventory_signals", next).catch(() => writeStorage(STORAGE_KEYS.inventorySignals, next));
  }
  function setPriceEstimates(next: PriceEstimate[]) {
    if (_cache) _cache.priceEstimates = next;
    setPriceEstimatesState(next);
    dbSave("price_estimates", next).catch(() => writeStorage(STORAGE_KEYS.priceEstimates, next));
  }

  const targets = useMemo(() => apartments.filter((x) => x.role === "target"), [apartments]);
  const comparables = useMemo(() => apartments.filter((x) => x.role === "comparable"), [apartments]);

  return {
    ready,
    dataSource,
    apartments,
    targets,
    comparables,
    comparableRules,
    comparableApartments,
    transactions,
    listings,
    inventorySignals,
    priceEstimates,
    setApartments,
    setComparableRules,
    setComparableApartments,
    setTransactions,
    setListings,
    setInventorySignals,
    setPriceEstimates,
  };
}
