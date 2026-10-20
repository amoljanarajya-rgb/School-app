import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Class, Section, Department, FeeCategory, AssetCategory, Guardian, Staff, LibraryBook, Bus, BusRoute, ExternalExam } from "@/types/db";

// Reference / lookup data shared across forms. Cached at module scope after first load.
export type Lookups = {
  classes: Class[];
  sections: Section[];
  departments: Department[];
  feeCategories: FeeCategory[];
  assetCategories: AssetCategory[];
  guardians: Guardian[];
  staff: Staff[];
  books: LibraryBook[];
  buses: Bus[];
  busRoutes: BusRoute[];
  exams: ExternalExam[];
};

let cache: Lookups | null = null;

export function useLookups(): { data: Lookups | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<Lookups | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [classes, sections, departments, feeCategories, assetCategories, guardians, staff, books, buses, busRoutes, exams] =
        await Promise.all([
          supabase.from("classes").select("*").order("level"),
          supabase.from("sections").select("*").order("name"),
          supabase.from("departments").select("*").order("name"),
          supabase.from("fee_categories").select("*").order("name"),
          supabase.from("asset_categories").select("*").order("name"),
          supabase.from("guardians").select("*").order("full_name"),
          supabase.from("staff").select("*").order("full_name"),
          supabase.from("library_books").select("*").order("title"),
          supabase.from("buses").select("*").order("bus_no"),
          supabase.from("bus_routes").select("*").order("route_name"),
          supabase.from("external_exams").select("*").order("exam_date", { ascending: false }),
        ]);
      if (!active) return;
      const firstError = [classes, sections, departments, feeCategories, assetCategories, guardians, staff, books, buses, busRoutes, exams].find(
        (r) => r.error,
      );
      if (firstError?.error) {
        setError(firstError.error.message);
      } else {
        const loaded: Lookups = {
          classes: classes.data as Class[],
          sections: sections.data as Section[],
          departments: departments.data as Department[],
          feeCategories: feeCategories.data as FeeCategory[],
          assetCategories: assetCategories.data as AssetCategory[],
          guardians: guardians.data as Guardian[],
          staff: staff.data as Staff[],
          books: books.data as LibraryBook[],
          buses: buses.data as Bus[],
          busRoutes: busRoutes.data as BusRoute[],
          exams: exams.data as ExternalExam[],
        };
        cache = loaded;
        setData(loaded);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}

export function clearLookupCache() {
  cache = null;
}
