"use client";

import { useEffect, useMemo, useState } from "react";
import type { Apartment, ComparableApartment, ComparableRule } from "@/types/apartment";
import type { InventorySignal, Listing } from "@/types/listing";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { defaultComparableRule, defaultModelWeights } from "./seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "./storage";
import { dbGet, dbSave } from "./dbClient";

export function useRealtyStore() {
  const [apartments, setApartmentsState] = useState<Apartment[]>([]);
  const [comparableRules, setComparableRulesState] = useState<ComparableRule[]>([]);
  const [comparableApartments, setComparableApartmentsState] = useState<ComparableApartment[]>([]);
  const [transactions, setTransactionsState] = useState<Transaction[]>([]);
  const [listings, setListingsState] = useState<Listing[]>([]);
  const [inventorySignals, setInventorySignalsState] = useState<InventorySignal[]>([]);
  const [priceEstimates, setPriceEstimatesState] = useState<PriceEstimate[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
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
        setApartmentsState(apts);
        setComparableRulesState(rules.length > 0 ? rules : apts.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id)));
        setComparableApartmentsState(compApts);
        setTransactionsState(txs);
        setListingsState(lstngs);
        setInventorySignalsState(invSigs);
        setPriceEstimatesState(priceEsts);
      } catch {
        // DB 연결 실패 시 localStorage fallback
        const storedApts = readStorage<Apartment[]>(STORAGE_KEYS.apartments, []);
        setApartmentsState(storedApts);
        setComparableRulesState(readStorage<ComparableRule[]>(STORAGE_KEYS.comparableRules, storedApts.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id))));
        setComparableApartmentsState(readStorage<ComparableApartment[]>(STORAGE_KEYS.comparableApartments, []));
        setTransactionsState(readStorage<Transaction[]>(STORAGE_KEYS.transactions, []));
        setListingsState(readStorage<Listing[]>(STORAGE_KEYS.listings, []));
        setInventorySignalsState(readStorage<InventorySignal[]>(STORAGE_KEYS.inventorySignals, []));
        setPriceEstimatesState(readStorage<PriceEstimate[]>(STORAGE_KEYS.priceEstimates, []));
      }
      if (!readStorage(STORAGE_KEYS.modelSettings, null)) writeStorage(STORAGE_KEYS.modelSettings, defaultModelWeights);
      setReady(true);
    }
    load();
  }, []);

  function setApartments(next: Apartment[]) {
    setApartmentsState(next);
    dbSave("apartments", next).catch(() => writeStorage(STORAGE_KEYS.apartments, next));
  }
  function setComparableRules(next: ComparableRule[]) {
    setComparableRulesState(next);
    dbSave("comparable_rules", next).catch(() => writeStorage(STORAGE_KEYS.comparableRules, next));
  }
  function setComparableApartments(next: ComparableApartment[]) {
    setComparableApartmentsState(next);
    dbSave("comparable_apartments", next).catch(() => writeStorage(STORAGE_KEYS.comparableApartments, next));
  }
  function setTransactions(next: Transaction[]) {
    setTransactionsState(next);
    dbSave("transactions", next).catch(() => writeStorage(STORAGE_KEYS.transactions, next));
  }
  function setListings(next: Listing[]) {
    setListingsState(next);
    dbSave("listings", next).catch(() => writeStorage(STORAGE_KEYS.listings, next));
  }
  function setInventorySignals(next: InventorySignal[]) {
    setInventorySignalsState(next);
    dbSave("inventory_signals", next).catch(() => writeStorage(STORAGE_KEYS.inventorySignals, next));
  }
  function setPriceEstimates(next: PriceEstimate[]) {
    setPriceEstimatesState(next);
    dbSave("price_estimates", next).catch(() => writeStorage(STORAGE_KEYS.priceEstimates, next));
  }

  const targets = useMemo(() => apartments.filter((x) => x.role === "target"), [apartments]);
  const comparables = useMemo(() => apartments.filter((x) => x.role === "comparable"), [apartments]);

  return {
    ready,
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
