import { useEffect, useState } from "react";
import { commands, type MapCacheState, type MapSettings as Settings } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { describeError } from "../../../core/errors";
import { numberFormat, plural, t } from "../../../core/i18n";
import { Field } from "./parts";

/** The one connection of the software: it can be cut, and its addresses changed without an update [REP-04b, REP-04e]. */
export function MapSettings({ notify, Group, Row, Switch }: {
  notify: (m: { text: string; tone?: "error" }) => void;
  Group: React.ComponentType<{ title?: string; children: React.ReactNode }>;
  Row: React.ComponentType<{ title: React.ReactNode; help?: React.ReactNode; children?: React.ReactNode; id?: string; stack?: boolean }>;
  Switch: React.ComponentType<{ id: string; checked: boolean; onChange: (v: boolean) => void }>;
}) {
  const [s, setS] = useState<Settings | null>(null);
  const [cache, setCache] = useState<MapCacheState | null>(null);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const refresh = () => void commands.mapCacheState().then(unwrap).then(setCache).catch(fail);
  useEffect(() => {
    void commands.mapSettingsGet().then(setS);
    refresh();
  }, []);
  if (!s) return null;
  const save = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    void commands
      .mapSettingsSet(next)
      .then(unwrap)
      .then(() => setS(next))
      .catch(fail);
  };
  const url = (key: "tilesUrl" | "fontsUrl" | "geocodeUrl" | "carUrl" | "footUrl" | "routeKeyUrl") => (
    <Row key={key} title={t(`settings.map.${key}`)} stack>
      <Field label={t(`settings.map.${key}`)} hideLabel value={s[key] ?? ""} onCommit={(v) => save({ [key]: v.trim() })} />
    </Row>
  );
  return (
    <>
      <Group>
        <Row title={t("settings.map.enabled")} help={t("settings.map.enabledHelp")} id="map-on">
          <Switch id="map-on" checked={!!s.enabled} onChange={(v) => save({ enabled: v })} />
        </Row>
      </Group>
      <Group title={t("settings.map.cache")}>
        <Row title={t("settings.map.cacheSize")} help={cache ? t("settings.map.cacheHelp", { tiles: numberFormat().format(cache.tiles), zones: plural("settings.map.zones", cache.zones.length) }) : ""}>
          <span className="muted">{cache ? t("settings.map.megabytes", { n: numberFormat({ maximumFractionDigits: 0 }).format((cache.bytes ?? 0) / 1048576) }) : ""}</span>
          <button type="button" className="btn" onClick={() => void commands.mapCacheClear().then(unwrap).then(refresh).catch(fail)}>
            {t("settings.map.clear")}
          </button>
        </Row>
      </Group>
      <Group title={t("settings.map.services")}>
        {url("tilesUrl")}
        {url("fontsUrl")}
        {url("geocodeUrl")}
        {url("carUrl")}
        {url("footUrl")}
        {url("routeKeyUrl")}
        <Row title={t("settings.map.routeKey")} help={t("settings.map.routeKeyHelp")} stack>
          <Field label={t("settings.map.routeKey")} hideLabel value={s.routeKey ?? ""} onCommit={(v) => save({ routeKey: v.trim() })} />
        </Row>
      </Group>
      <p className="set-note">{t("settings.map.note")}</p>
    </>
  );
}
