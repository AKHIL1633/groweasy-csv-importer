import type { CrmRecord } from "../schemas/crm-record.schema";
import type { CrmFieldMeta } from "../types/crm";

// Canonical field order — drives results table columns and the AI prompt's
// field list (docs/07-ai-design.md §3, docs/12-ui-design.md §6).
export const CRM_FIELDS: readonly CrmFieldMeta[] = [
  { key: "created_at", label: "Created At", description: "Lead creation date/time." },
  { key: "name", label: "Name", description: "The lead's full name." },
  { key: "email", label: "Email", description: "The lead's primary email address." },
  {
    key: "country_code",
    label: "Country Code",
    description: "Phone country code only, e.g. +91.",
  },
  {
    key: "mobile_without_country_code",
    label: "Mobile Number",
    description: "The lead's phone number with any country code removed.",
  },
  { key: "company", label: "Company", description: "The lead's company or employer name." },
  { key: "city", label: "City", description: "The lead's city." },
  { key: "state", label: "State", description: "The lead's state or province." },
  { key: "country", label: "Country", description: "The lead's country." },
  { key: "lead_owner", label: "Lead Owner", description: "The salesperson assigned to this lead." },
  { key: "crm_status", label: "Status", description: "The lead's current CRM status." },
  {
    key: "crm_note",
    label: "Notes",
    description: "Remarks, follow-up notes, or any extra emails/phone numbers found for this row.",
  },
  {
    key: "data_source",
    label: "Data Source",
    description: "Which marketing/lead source this came from.",
  },
  {
    key: "possession_time",
    label: "Possession Time",
    description: "For real estate leads, expected property possession time.",
  },
  {
    key: "description",
    label: "Description",
    description: "Any other useful information that doesn't fit another field.",
  },
];

// FR-18: a record is skipped only if it has neither of these.
export const CONTACT_INFO_FIELDS: readonly (keyof CrmRecord)[] = [
  "email",
  "mobile_without_country_code",
];
