"use client";

import { useEffect, useMemo, useState } from "react";
import type { Apartment, ComparableApartment, ComparableRule } from "@/types/apartment";
import type { InventorySignal, Listing } from "@/types/listing";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { defaultComparableRule, defaultModelWeights } from "./seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "./storage";

export function useRealtyStore() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [comparableRules, setComparableRules] = useState<ComparableRule[]>([]);
  const [comparableApartments, setComparableApartments] = useState<ComparableApartment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [inventorySignals, setInventorySignals] = useState<InventorySignal[]>([]);
  const [priceEstimates, setPriceEstimates] = useState<PriceEstimate[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedApartments = readStorage<Apartment[]>(STORAGE_KEYS.apartments, []);
    setApartments(storedApartments);
    setComparableRules(readStorage<ComparableRule[]>(STORAGE_KEYS.comparableRules, storedApartments.filter((x) => x.role === "target").map((x) => defaultComparableRule(x.id))));
    setComparableApartments(readStorage<ComparableApartment[]>(STORAGE_KEYS.comparableApartments, []));
    setTransactions(readStorage<Transaction[]>(STORAGE_KEYS.transactions, []));
    setListings(readStorage<Listing[]>(STORAGE_KEYS.listings, []));
    setInventorySignals(readStorage<InventorySignal[]>(STORAGE_KEYS.inventorySignals, []));
    setPriceEstimates(readStorage<PriceEstimate[]>(STORAGE_KEYS.priceEstimates, []));
    if (!readStorage(STORAGE_KEYS.modelSettings, null)) writeStorage(STORAGE_KEYS.modelSettings, defaultModelWeights);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.apartments, apartments);
  }, [apartments, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.comparableRules, comparableRules);
  }, [comparableRules, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.comparableApartments, comparableApartments);
  }, [comparableApartments, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.transactions, transactions);
  }, [transactions, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.listings, listings);
  }, [listings, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.inventorySignals, inventorySignals);
  }, [inventorySignals, ready]);

  useEffect(() => {
    if (ready) writeStorage(STORAGE_KEYS.priceEstimates, priceEstimates);
  }, [priceEstimates, ready]);

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
    setPriceEstimates
  };
}
