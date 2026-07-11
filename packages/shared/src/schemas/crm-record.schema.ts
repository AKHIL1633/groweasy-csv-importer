import { z } from "zod";
import { CRM_STATUS_VALUES } from "../constants/crm-status";
import { DATA_SOURCE_VALUES } from "../constants/data-source";

// Blank ("") is explicitly valid for both — see docs/07-ai-design.md §4.
export const crmStatusSchema = z.enum([...CRM_STATUS_VALUES]).or(z.literal(""));
export const dataSourceSchema = z.enum([...DATA_SOURCE_VALUES]).or(z.literal(""));

// The 15-field GrowEasy CRM lead record (docs/02-requirements.md FR-13).
// Every field is a plain string; blank ("") means "no confident value",
// never omitted. No format constraints (e.g. z.string().email()) here —
// that would be business-rule validation, not structural validation.
export const crmRecordSchema = z.object({
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  country_code: z.string(),
  mobile_without_country_code: z.string(),
  company: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  lead_owner: z.string(),
  crm_status: crmStatusSchema,
  crm_note: z.string(),
  data_source: dataSourceSchema,
  possession_time: z.string(),
  description: z.string(),
});

export type CrmRecord = z.infer<typeof crmRecordSchema>;
