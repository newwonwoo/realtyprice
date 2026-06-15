"use client";

import { useEffect, useMemo, useState } from "react";
import type { Apartment, ComparableApartment, ComparableRule } from "@/types/apartment";
import type { InventorySignal, Listing } from "@/types/listing";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { defaultComparableRule } from "./seed";
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
      setComparableRulesState(
        rules.length > 0
          ? rules
          : apts.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id)),
      );
      setComparableApartmentsState(compApts);
      setTransactionsState(txs);
      setListingsState(lstngs);
      setInventorySignalsState(invSigs);
      setPriceEstimatesState(priceEsts);
      setReady(true);
    }
    load().catch(console.error);
  }, []);

  function setApartments(value: Apartment[] | ((prev: Apartment[]) => Apartment[])) {
    setApartmentsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("apartments", next).catch(console.error);
      return next;
    });
  }

  function setComparableRules(value: ComparableRule[] | ((prev: ComparableRule[]) => ComparableRule[])) {
    setComparableRulesState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("comparable_rules", next).catch(console.error);
      return next;
    });
  }

  function setComparableApartments(
    value: ComparableApartment[] | ((prev: ComparableApartment[]) => ComparableApartment[]),
  ) {
    setComparableApartmentsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("comparable_apartments", next).catch(console.error);
      return next;
    });
  }

  function setTransactions(value: Transaction[] | ((prev: Transaction[]) => Transaction[])) {
    setTransactionsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("transactions", next).catch(console.error);
      return next;
    });
  }

  function setListings(value: Listing[] | ((prev: Listing[]) => Listing[])) {
    setListingsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("listings", next).catch(console.error);
      return next;
    });
  }

  function setInventorySignals(
    value: InventorySignal[] | ((prev: InventorySignal[]) => InventorySignal[]),
  ) {
    setInventorySignalsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("inventory_signals", next).catch(console.error);
      return next;
    });
  }

  function setPriceEstimates(value: PriceEstimate[] | ((prev: PriceEstimate[]) => PriceEstimate[])) {
    setPriceEstimatesState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      dbSave("price_estimates", next).catch(console.error);
      return next;
    });
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
