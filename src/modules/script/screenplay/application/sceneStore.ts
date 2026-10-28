import type { Node as PMNode } from "prosemirror-model";
import { db, nowIso, query, write } from "../../../../core/db/client";
import { parseHeading } from "../domain/heading";
import { planSave, type DocScene, type StoredScene } from "../domain/savePlan";
import { docFromScenes, sceneContent, sceneFromStored } from "../ui/editor/schema";

interface Saved extends StoredScene {
  node: PMNode;
}

/** Keeps the scenes of the database in step with the editor: only changed scenes are written. */
export class SceneStore {
  private saved = new Map<string, Saved>();

  async load(): Promise<PMNode> {
    const rows = await query(
      db.selectFrom("scene").select(["id", "rank", "content", "length_eighths"]).where("deleted_at", "is", null).orderBy("rank"),
    );
    const scenes = rows.map((r) => {
      const node = sceneFromStored(r.id, r.content);
      this.saved.set(r.id, { node, rank: r.rank, content: r.content, eighths: r.length_eighths });
      return node;
    });
    return docFromScenes(scenes);
  }

  /** Writes the difference between `doc` and the database in one batch; returns the number of scenes written. */
  async save(doc: PMNode, sceneEighths: number[]): Promise<number> {
    const nodes: PMNode[] = [];
    const scenes: DocScene[] = [];
    doc.forEach((node, _o, i) => {
      const id = node.attrs.id as string;
      const old = this.saved.get(id);
      const content = old && old.node === node ? old.content : sceneContent(node);
      const heading = node.firstChild?.type.name === "scene_heading" ? parseHeading(node.firstChild.textContent) : parseHeading("");
      nodes.push(node);
      scenes.push({ id, content, eighths: sceneEighths[i] ?? 0, heading });
    });
    const plan = planSave(scenes, this.saved);
    if (plan.upserts.length === 0 && plan.deletes.length === 0) {
      scenes.forEach((s, i) => {
        const old = this.saved.get(s.id);
        if (old) old.node = nodes[i];
      });
      return 0;
    }
    const now = nowIso();
    const queries = plan.upserts.map((u) =>
      db
        .insertInto("scene")
        .values({
          id: u.id,
          rank: u.rank,
          content: u.content,
          heading_int_ext: u.heading.intExt,
          heading_location: u.heading.location,
          heading_time: u.heading.time,
          length_eighths: u.eighths,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            rank: u.rank,
            content: u.content,
            heading_int_ext: u.heading.intExt,
            heading_location: u.heading.location,
            heading_time: u.heading.time,
            length_eighths: u.eighths,
            updated_at: now,
            deleted_at: null,
          }),
        ),
    );
    const deletion = plan.deletes.length > 0 ? [db.updateTable("scene").set({ deleted_at: now, updated_at: now }).where("id", "in", plan.deletes)] : [];
    // The editor undoes its own text.
    await write("Écriture du scénario", ["scene"], [...queries, ...deletion], false);

    for (const id of plan.deletes) this.saved.delete(id);
    const index = new Map(scenes.map((s, i) => [s.id, i]));
    for (const u of plan.upserts) this.saved.set(u.id, { node: nodes[index.get(u.id)!], rank: u.rank, content: u.content, eighths: u.eighths });
    scenes.forEach((s, i) => {
      const old = this.saved.get(s.id);
      if (old) old.node = nodes[i];
    });
    return plan.upserts.length + plan.deletes.length;
  }
}
