import type { Apartment, ApartmentSearchFilter } from "@/types/apartment";

export function searchApartments(apartments: Apartment[], filter: ApartmentSearchFilter) {
  const regionKeyword = filter.regionKeyword?.trim().toLowerCase() ?? "";
  const nameKeyword = filter.nameKeyword?.trim().toLowerCase() ?? "";

  return apartments.filter((apt) => {
    const regionMatched =
      !regionKeyword ||
      apt.region.toLowerCase().includes(regionKeyword) ||
      apt.address.toLowerCase().includes(regionKeyword);

    const nameMatched =
      !nameKeyword ||
      apt.name.toLowerCase().includes(nameKeyword) ||
      (apt.shortName?.toLowerCase().includes(nameKeyword) ?? false);

    return regionMatched && nameMatched;
  });
}
