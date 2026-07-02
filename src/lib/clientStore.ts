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
let _cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
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
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return Promise.resolve({ snapshot: _cache, source: "db" as const });
  if (!_loadPromise) {
    _loadPromise = _loadFromSource().then((r) => {
      _cache = r.snapshot;
      _cacheAt = Date.now();
      _loadPromise = null;
      return r;
    });
  }
  return _loadPromise;
}

export function invalidateStoreCache() {
  _cache = null;
  _cacheAt = 0;
  _loadPromise = null;
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

  // 각 setter는 값뿐 아니라 React의 표준 함수형 업데이트(prev => next)도 받는다.
  // 값 형태(setX(newArray))로만 받으면, 같은 렌더 사이클 안에서 여러 번 연달아
  // 호출될 때(예: 자동추천 여러 단지를 빠르게 추가) 각 호출이 "마지막 렌더 시점"의
  // stale한 배열을 기준으로 새 배열을 만들어 서로 덮어써버리는 레이스가 생긴다.
  // setXState(prev => ...) 형태를 쓰면 React가 항상 최신 대기 상태를 넘겨줘 안전하다.
  function setApartments(next: Apartment[] | ((prev: Apartment[]) => Apartment[])) {
    setApartmentsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.apartments = resolved;
      dbSave("apartments", resolved).catch(() => writeStorage(STORAGE_KEYS.apartments, resolved));
      return resolved;
    });
  }
  function setComparableRules(next: ComparableRule[] | ((prev: ComparableRule[]) => ComparableRule[])) {
    setComparableRulesState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.comparableRules = resolved;
      dbSave("comparable_rules", resolved).catch(() => writeStorage(STORAGE_KEYS.comparableRules, resolved));
      return resolved;
    });
  }
  function setComparableApartments(next: ComparableApartment[] | ((prev: ComparableApartment[]) => ComparableApartment[])) {
    setComparableApartmentsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.comparableApartments = resolved;
      dbSave("comparable_apartments", resolved).catch(() => writeStorage(STORAGE_KEYS.comparableApartments, resolved));
      return resolved;
    });
  }
  function setTransactions(next: Transaction[] | ((prev: Transaction[]) => Transaction[])) {
    setTransactionsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.transactions = resolved;
      dbSave("transactions", resolved).catch(() => writeStorage(STORAGE_KEYS.transactions, resolved));
      return resolved;
    });
  }
  function setListings(next: Listing[] | ((prev: Listing[]) => Listing[])) {
    setListingsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.listings = resolved;
      dbSave("listings", resolved).catch(() => writeStorage(STORAGE_KEYS.listings, resolved));
      return resolved;
    });
  }
  function setInventorySignals(next: InventorySignal[] | ((prev: InventorySignal[]) => InventorySignal[])) {
    setInventorySignalsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.inventorySignals = resolved;
      dbSave("inventory_signals", resolved).catch(() => writeStorage(STORAGE_KEYS.inventorySignals, resolved));
      return resolved;
    });
  }
  function setPriceEstimates(next: PriceEstimate[] | ((prev: PriceEstimate[]) => PriceEstimate[])) {
    setPriceEstimatesState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (_cache) _cache.priceEstimates = resolved;
      dbSave("price_estimates", resolved).catch(() => writeStorage(STORAGE_KEYS.priceEstimates, resolved));
      return resolved;
    });
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
