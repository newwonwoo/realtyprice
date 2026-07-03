"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Apartment, ComparableApartment, ComparableRule } from "@/types/apartment";
import type { InventorySignal, Listing } from "@/types/listing";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { defaultComparableRule, defaultModelWeights } from "./seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "./storage";
import { dbGet, dbSave } from "./dbClient";

// ── 전역 공유 스토어(단일 소스) ──────────────────────────────────────
// 이전엔 useRealtyStore()를 호출하는 컴포넌트마다 독립된 useState를 갖고
// 모듈 캐시(_state)는 "재마운트 시 즉시 복원"용으로만 썼다. 그 결과 한 컴포넌트
// (예: ComparablesManager)에서 저장해도 같은 화면의 다른 컴포넌트(예: 상위 페이지)는
// 자기 useState가 그대로라 갱신을 못 보고, "저장했는데 다음 단계에 0개로 보임" 같은
// 버그가 났다. useSyncExternalStore로 모든 인스턴스가 동일한 _state를 구독하게 해서
// 어느 컴포넌트가 바꾸든 즉시 전체에 반영되게 한다.
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

type FullState = {
  ready: boolean;
  dataSource: "db" | "local" | null;
  snapshot: StoreSnapshot;
};

function emptySnapshot(): StoreSnapshot {
  return {
    apartments: [],
    comparableRules: [],
    comparableApartments: [],
    transactions: [],
    listings: [],
    inventorySignals: [],
    priceEstimates: [],
  };
}

let _state: FullState = { ready: false, dataSource: null, snapshot: emptySnapshot() };
let _cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
let _loadPromise: Promise<LoadResult> | null = null;
const _listeners = new Set<() => void>();

function _setState(patch: Partial<FullState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn());
}

function _subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _getState() {
  return _state;
}

function _getServerState() {
  return _state;
}

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
  if (_state.ready && now - _cacheAt < CACHE_TTL_MS) return Promise.resolve({ snapshot: _state.snapshot, source: _state.dataSource ?? "db" });
  if (!_loadPromise) {
    _loadPromise = _loadFromSource().then((r) => {
      _cacheAt = Date.now();
      _loadPromise = null;
      return r;
    });
  }
  return _loadPromise;
}

export function invalidateStoreCache() {
  _cacheAt = 0;
  _loadPromise = null;
  _setState({ ready: false, dataSource: null, snapshot: emptySnapshot() });
}

// ── 공유 setter — 항상 최신 _state.snapshot 기준으로 갱신하므로 어느 컴포넌트에서
// 호출해도 레이스 없이 안전하다(함수형 업데이트도 계속 지원). ─────────────────────
function setApartments(next: Apartment[] | ((prev: Apartment[]) => Apartment[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.apartments) : next;
  _setState({ snapshot: { ..._state.snapshot, apartments: resolved } });
  dbSave("apartments", resolved).catch(() => writeStorage(STORAGE_KEYS.apartments, resolved));
}
function setComparableRules(next: ComparableRule[] | ((prev: ComparableRule[]) => ComparableRule[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.comparableRules) : next;
  _setState({ snapshot: { ..._state.snapshot, comparableRules: resolved } });
  dbSave("comparable_rules", resolved).catch(() => writeStorage(STORAGE_KEYS.comparableRules, resolved));
}
function setComparableApartments(next: ComparableApartment[] | ((prev: ComparableApartment[]) => ComparableApartment[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.comparableApartments) : next;
  _setState({ snapshot: { ..._state.snapshot, comparableApartments: resolved } });
  dbSave("comparable_apartments", resolved).catch(() => writeStorage(STORAGE_KEYS.comparableApartments, resolved));
}
function setTransactions(next: Transaction[] | ((prev: Transaction[]) => Transaction[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.transactions) : next;
  _setState({ snapshot: { ..._state.snapshot, transactions: resolved } });
  dbSave("transactions", resolved).catch(() => writeStorage(STORAGE_KEYS.transactions, resolved));
}
function setListings(next: Listing[] | ((prev: Listing[]) => Listing[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.listings) : next;
  _setState({ snapshot: { ..._state.snapshot, listings: resolved } });
  dbSave("listings", resolved).catch(() => writeStorage(STORAGE_KEYS.listings, resolved));
}
function setInventorySignals(next: InventorySignal[] | ((prev: InventorySignal[]) => InventorySignal[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.inventorySignals) : next;
  _setState({ snapshot: { ..._state.snapshot, inventorySignals: resolved } });
  dbSave("inventory_signals", resolved).catch(() => writeStorage(STORAGE_KEYS.inventorySignals, resolved));
}
function setPriceEstimates(next: PriceEstimate[] | ((prev: PriceEstimate[]) => PriceEstimate[])) {
  const resolved = typeof next === "function" ? next(_state.snapshot.priceEstimates) : next;
  _setState({ snapshot: { ..._state.snapshot, priceEstimates: resolved } });
  dbSave("price_estimates", resolved).catch(() => writeStorage(STORAGE_KEYS.priceEstimates, resolved));
}

// ── Hook ──────────────────────────────────────────────────────────
export function useRealtyStore() {
  const state = useSyncExternalStore(_subscribe, _getState, _getServerState);

  useEffect(() => {
    if (state.ready) return;
    _getOrLoad().then((r) => _setState({ ready: true, dataSource: r.source, snapshot: r.snapshot }));
    if (!readStorage(STORAGE_KEYS.modelSettings, null)) writeStorage(STORAGE_KEYS.modelSettings, defaultModelWeights);
  }, [state.ready]);

  // 다른 탭에서 데이터를 변경하면 캐시 무효화 후 재로드
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (!e.key?.startsWith("realty_") && !e.key?.startsWith("real_estate_signal_")) return;
      _cacheAt = 0;
      _loadPromise = null;
      _getOrLoad().then((r) => _setState({ ready: true, dataSource: r.source, snapshot: r.snapshot }));
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const { apartments, comparableRules, comparableApartments, transactions, listings, inventorySignals, priceEstimates } = state.snapshot;

  const targets = useMemo(() => apartments.filter((x) => x.role === "target"), [apartments]);
  const comparables = useMemo(() => apartments.filter((x) => x.role === "comparable"), [apartments]);

  return {
    ready: state.ready,
    dataSource: state.dataSource,
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
