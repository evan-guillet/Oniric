/** Tables of the project database, as defined by src-tauri/migrations. */

import type { Generated } from "kysely";

export interface ProjectSettingTable {
  key: string;
  value: string;
  updated_at: string;
}

export type SceneStatus = "todo" | "draft" | "rewrite" | "done";

export interface SceneTable {
  id: string;
  rank: string;
  number: string | null;
  number_locked: Generated<number>;
  heading_int_ext: string | null;
  heading_location: string | null;
  heading_time: string | null;
  /** JSON ProseMirror content of the scene: its screenplay elements. */
  content: string;
  summary: Generated<string>;
  color: string | null;
  length_eighths: Generated<number>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sequence_id: Generated<string | null>;
  status: Generated<SceneStatus | null>;
  /** JSON array of strings. */
  tags: Generated<string>;
  /** JSON array of plotline names (A, B, C…). */
  plotlines: Generated<string>;
  story_time: Generated<string | null>;
}

export interface ActTable {
  id: string;
  rank: string;
  title: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceTable {
  id: string;
  act_id: string | null;
  rank: string;
  title: string;
  summary: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface StructureBeatTable {
  id: string;
  model: string;
  key: string;
  rank: string;
  title: string;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface BeatSceneTable {
  beat_id: string;
  scene_id: string;
}

export interface WorkshopFieldTable {
  key: string;
  /** JSON value. */
  value: string;
  updated_at: string;
}

export interface WorkshopFieldVersionTable {
  id: string;
  key: string;
  value: string;
  created_at: string;
}

export interface DocumentTable {
  id: string;
  kind: string;
  /** JSON ProseMirror document. */
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionTable {
  id: string;
  document_id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface BibleTypeTable {
  id: string;
  name: string;
  /** JSON array of field definitions. */
  fields: Generated<string>;
  /** Key of the type's icon in the app's set; empty for the plain sheet. */
  icon: Generated<string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type EntryStatus = "idea" | "validated" | "abandoned";

export interface BibleEntryTable {
  id: string;
  type: string;
  name: string;
  aliases: Generated<string>;
  summary: Generated<string>;
  content: Generated<string>;
  fields: Generated<string>;
  tags: Generated<string>;
  links: Generated<string>;
  status: Generated<EntryStatus>;
  image: string | null;
  gallery: Generated<string>;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface BibleEntryVersionTable {
  id: string;
  entry_id: string;
  data: string;
  created_at: string;
}

export interface RelationTable {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  note: Generated<string>;
  act_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteTable {
  id: string;
  scene_id: string | null;
  quote: Generated<string>;
  body: Generated<string>;
  color: Generated<string>;
  resolved: Generated<number>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ScriptVersionTable {
  id: string;
  name: string;
  file: string;
  sha256: string;
  pages: number;
  scenes: number;
  created_at: string;
}

export type MoodboardItemKind = "image" | "color" | "text" | "note";

export interface MoodboardTable {
  id: string;
  rank: string;
  name: string;
  kind: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface MoodboardItemTable {
  id: string;
  board_id: string;
  kind: MoodboardItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: Generated<number>;
  /** JSON: {path} for an image, {color} for a colour, {text} for a text or a note. */
  data: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface MoodboardLinkTable {
  board_id: string;
  /** A scene or a bible entry. */
  target_id: string;
}

export interface ShotTable {
  id: string;
  scene_id: string;
  rank: string;
  shoot_order: number | null;
  size: string | null;
  angle: string | null;
  movement: string | null;
  support: string | null;
  sound: string | null;
  lens: Generated<string>;
  camera: Generated<string>;
  frame_rate: Generated<string>;
  /** JSON array of character names. */
  characters: Generated<string>;
  action: Generated<string>;
  dialogue: Generated<string>;
  /** Seconds on screen. */
  duration: number | null;
  /** Minutes to shoot. */
  setup: number | null;
  lighting: Generated<string>;
  effects: Generated<string>;
  notes: Generated<string>;
  /** JSON array of the texts of the scene elements the shot covers. */
  covers: Generated<string>;
  frame_image: string | null;
  frame_notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface ContactTable {
  id: string;
  name: string;
  /** JSON object: the card's other fields. */
  data: Generated<string>;
  book_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractStatus = "none" | "sent" | "signed";

export interface CrewMemberTable {
  id: string;
  contact_id: string;
  department: string;
  role: string;
  head: Generated<number>;
  rank: string;
  start_date: string | null;
  end_date: string | null;
  rate: Generated<string>;
  contract: Generated<ContractStatus>;
  created_at: string;
  updated_at: string;
}

export type CastKind = "lead" | "supporting" | "bit" | "extra" | "double" | "stunt";

export interface CastRoleTable {
  id: string;
  character: string;
  kind: Generated<CastKind>;
  number: number | null;
  contact_id: string | null;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export type CandidateStatus = "candidate" | "audition" | "shortlist" | "chosen" | "declined";

export interface CastingCandidateTable {
  id: string;
  role_id: string;
  contact_id: string;
  status: Generated<CandidateStatus>;
  audition_at: string | null;
  video: string | null;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface UnavailabilityTable {
  id: string;
  contact_id: string;
  start_date: string;
  end_date: string;
  note: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface BreakdownElementTable {
  id: string;
  category: string;
  name: string;
  entry_id: string | null;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface BreakdownItemTable {
  scene_id: string;
  element_id: string;
  quantity: number | null;
}

export interface BreakdownSceneTable {
  scene_id: string;
  checked_text: string | null;
  /** JSON array of the suggestion keys turned down. */
  rejected: Generated<string>;
  updated_at: string;
}

export interface ScheduleTable {
  id: string;
  name: string;
  rank: string;
  start_date: string | null;
  /** JSON array of the week days worked, 1 for Monday. */
  week: Generated<string>;
  day_minutes: Generated<number>;
  page_minutes: Generated<number>;
  created_at: string;
  updated_at: string;
}

export type DayKind = "shoot" | "off" | "travel";

export interface ShootDayTable {
  id: string;
  schedule_id: string;
  rank: string;
  kind: Generated<DayKind>;
  date: string | null;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface StripTable {
  id: string;
  day_id: string;
  rank: string;
  scene_id: string | null;
  banner: string | null;
  created_at: string;
  updated_at: string;
}

export type EventPhase = "prep" | "tests" | "shoot" | "edit" | "delivery" | "other";

export interface ProductionEventTable {
  id: string;
  phase: EventPhase;
  title: string;
  start_date: string;
  end_date: string;
  notes: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface CallSheetTable {
  id: string;
  day_id: string;
  data: Generated<string>;
  versions: Generated<string>;
  report: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface CallRecipientTable {
  sheet_id: string;
  contact_id: string;
  call_time: Generated<string>;
  sent: Generated<number>;
  confirmed: Generated<number>;
}

export type WorkshopItemKind = "pass" | "reader" | "remark" | "deposit" | "submission" | "request";

export interface WorkshopItemTable {
  id: string;
  kind: WorkshopItemKind;
  parent_id: string | null;
  rank: string;
  data: Generated<string>;
  created_at: string;
  updated_at: string;
}

export interface Database {
  project_setting: ProjectSettingTable;
  scene: SceneTable;
  act: ActTable;
  sequence: SequenceTable;
  structure_beat: StructureBeatTable;
  beat_scene: BeatSceneTable;
  workshop_field: WorkshopFieldTable;
  workshop_field_version: WorkshopFieldVersionTable;
  document: DocumentTable;
  document_version: DocumentVersionTable;
  bible_type: BibleTypeTable;
  bible_entry: BibleEntryTable;
  bible_entry_version: BibleEntryVersionTable;
  relation: RelationTable;
  note: NoteTable;
  script_version: ScriptVersionTable;
  moodboard: MoodboardTable;
  moodboard_item: MoodboardItemTable;
  moodboard_link: MoodboardLinkTable;
  shot: ShotTable;
  contact: ContactTable;
  crew_member: CrewMemberTable;
  cast_role: CastRoleTable;
  casting_candidate: CastingCandidateTable;
  unavailability: UnavailabilityTable;
  breakdown_element: BreakdownElementTable;
  breakdown_item: BreakdownItemTable;
  breakdown_scene: BreakdownSceneTable;
  schedule: ScheduleTable;
  shoot_day: ShootDayTable;
  strip: StripTable;
  production_event: ProductionEventTable;
  call_sheet: CallSheetTable;
  call_recipient: CallRecipientTable;
  workshop_item: WorkshopItemTable;
}

export type TableName = keyof Database;
