import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { commands } from "../../../bindings";
import { describeError } from "../../../core/errors";
import { Dialog } from "../../../ui-kit/Dialog";
import { FORMATS, formatHelp, formatName, groupFormats } from "../../script/screenplay/domain/formats";
import { Select } from "../../../ui-kit/Select";

export function NewProjectDialog({
  onCancel,
  onCreate,
  initialTitle = "",
  intro,
}: {
  onCancel: () => void;
  onCreate: (parent: string, title: string, formatId: string) => Promise<void>;
  initialTitle?: string;
  intro?: string;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [formatId, setFormatId] = useState(FORMATS[0].id);
  const [parent, setParent] = useState("");
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.defaultProjectsDir().then((r) => r.status === "ok" && setParent((p) => p || r.data));
  }, []);
  useEffect(() => {
    if (!parent || !title.trim()) return setFolder("");
    void commands.projectFolderFor(parent, title).then(setFolder);
  }, [parent, title]);

  const browse = async () => {
    const dir = await open({ directory: true, title: t("newProject.browseTitle"), defaultPath: parent || undefined });
    if (typeof dir === "string") setParent(dir);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(parent, title.trim(), formatId);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const valid = title.trim().length > 0 && parent.trim().length > 0;
  return (
    <Dialog
      title={t("newProject.title")}
      onCancel={onCancel}
      wide
      actions={[
        { label: t("newProject.cancel"), onClick: onCancel },
        { label: t("newProject.create"), onClick: submit, primary: true, disabled: !valid || busy },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void submit();
        }}
      >
        {intro && <p className="muted">{intro}</p>}
        <label className="field">
          <span>{t("newProject.name")}</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("newProject.namePlaceholder")}
            autoFocus
            maxLength={200}
          />
        </label>

        <label className="field">
          <span>{t("newProject.format")}</span>
          <Select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {groupFormats(FORMATS).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {formatName(f)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <small className="muted">{formatHelp(FORMATS.find((f) => f.id === formatId) ?? FORMATS[0])}</small>
        </label>

        <label className="field">
          <span>{t("newProject.location")}</span>
          <span className="input-row">
            <input name="location" value={parent} onChange={(e) => setParent(e.target.value)} spellCheck={false} />
            <button type="button" className="btn" onClick={browse}>
              {t("newProject.browse")}
            </button>
          </span>
        </label>
        {folder && <p className="muted small">{t("newProject.folder", { folder })}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
