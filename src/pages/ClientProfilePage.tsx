import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type AppErrorItem,
  type ClientProfile,
  type ErrorKind,
} from "../lib/api";
import { clearToken } from "../lib/auth";

const KIND_LABEL: Record<ErrorKind, string> = {
  search: "Recherche",
  probe: "Test connexion",
  equivalents: "Equivalents",
  capture: "Capture session",
  login: "Connexion app",
  activation: "Activation",
  runtime: "Erreur technique",
};

const KIND_OPTIONS: ErrorKind[] = [
  "search",
  "probe",
  "equivalents",
  "capture",
  "login",
  "activation",
  "runtime",
];

const LIMIT = 20;

const formatDateTime = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
};

const shortMachine = (machineId: string): string =>
  machineId ? `${machineId.slice(0, 12)}…${machineId.slice(-4)}` : "—";

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [errors, setErrors] = useState<AppErrorItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");

  const [detail, setDetail] = useState<AppErrorItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const logout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    console.log("profile", profile);
  }, [profile]);

  const loadProfile = useCallback(() => {
    if (!id) return;
    api
      .clientProfile(id)
      .then((p) => setProfile(p))
      .catch((err) =>
        setProfileError(
          err instanceof Error ? err.message : "Chargement impossible",
        ),
      );
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDeb(q);
      setPage(1);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .errors({ clientId: id, page, kind, q: qDeb, limit: LIMIT })
      .then((r) => {
        if (cancelled) return;
        setErrors(r.errors);
        setTotal(r.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setActionError(
          err instanceof Error ? err.message : "Chargement impossible",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id, page, kind, qDeb]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = errors ? errors.map((e) => e.id) : [];
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const reloadErrors = useCallback(async () => {
    if (!id) return;
    const r = await api.errors({
      clientId: id,
      page,
      kind,
      q: qDeb,
      limit: LIMIT,
    });
    setErrors(r.errors);
    setTotal(r.total);
    const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    if (page > pages) setPage(pages);
  }, [id, page, kind, qDeb]);

  const remove = async (item: AppErrorItem) => {
    if (!window.confirm("Supprimer cette erreur ?")) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteError(item.id);
      setSelected((prev) => {
        if (!prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      if (detail?.id === item.id) setDetail(null);
      loadProfile();
      await reloadErrors();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Suppression impossible",
      );
    } finally {
      setDeleting(false);
    }
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer ${ids.length} erreur(s) ?`)) return;
    setBulkDeleting(true);
    setActionError(null);
    const failed: string[] = [];
    for (const eid of ids) {
      try {
        await api.deleteError(eid);
      } catch {
        failed.push(eid);
      }
    }
    if (detail && ids.includes(detail.id)) setDetail(null);
    loadProfile();
    let errorMsg: string | null = failed.length
      ? `Suppression impossible pour ${failed.length} erreur(s)`
      : null;
    try {
      await reloadErrors();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Chargement impossible";
    }
    setSelected(new Set(failed));
    setActionError(errorMsg);
    setBulkDeleting(false);
  };

  const snapshots = profile
    ? [...profile.snapshots].sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      )
    : [];
  const latest = snapshots[0] ?? null;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const kpis = [
    {
      label: "NB erreurs",
      value: profile ? String(profile.errorCount) : "—",
      icon: "error",
      accent:
        profile && profile.errorCount > 0 ? "text-error" : "text-on-surface",
    },
    {
      label: "Non configure",
      value: profile ? String(profile.unconfiguredCount) : "—",
      icon: "settings_alert",
      accent:
        profile && profile.unconfiguredCount > 0
          ? "text-warning"
          : "text-on-surface",
    },
    {
      label: "Sites (derniere synchro)",
      value: latest ? String(latest.sites.length) : "—",
      icon: "domain",
      accent: "text-on-surface",
    },
    {
      label: "Derniere synchro",
      value: latest ? formatDateTime(latest.updatedAt) : "—",
      icon: "sync",
      accent: "text-on-surface",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-space-lg py-space-md flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <button
              type="button"
              onClick={() => navigate("/")}
              title="Retour aux souscripteurs"
              className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-secondary"
            >
              <span className="material-symbols-outlined text-[24px]">
                arrow_back
              </span>
            </button>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase text-secondary">
                B2B AUTO PARTS AGGREGATOR
              </span>
              <h1 className="font-headline-md text-headline-md uppercase text-on-surface">
                Profil client
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-space-sm">
            {profile?.user ? (
              <span className="hidden sm:flex flex-col text-right">
                <span className="font-body-md text-body-md font-semibold text-on-surface">
                  {profile.user.name}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  @{profile.user.username} · {profile.user.company || "—"}
                </span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md text-label-md uppercase tracking-wider border border-outline-variant hover:border-secondary hover:text-secondary transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">
                logout
              </span>
              Deconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-space-lg py-space-xl flex flex-col gap-space-xl">
        {profileError ? (
          <div className="p-space-sm bg-error-container text-on-error-container font-body-sm text-body-sm border border-error flex items-center justify-between">
            <span>{profileError}</span>
            <button
              type="button"
              onClick={() => setProfileError(null)}
              className="material-symbols-outlined"
            >
              close
            </button>
          </div>
        ) : null}

        {actionError ? (
          <div className="p-space-sm bg-error-container text-on-error-container font-body-sm text-body-sm border border-error flex items-center justify-between">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="material-symbols-outlined"
            >
              close
            </button>
          </div>
        ) : null}

        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-space-md">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-surface-container-lowest border border-outline-variant shadow-sm p-space-md flex flex-col gap-space-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase text-outline">
                  {k.label}
                </span>
                <span className="material-symbols-outlined text-[18px] text-secondary">
                  {k.icon}
                </span>
              </div>
              <span
                className={`font-headline-lg text-headline-lg tabular-nums-code ${k.accent}`}
              >
                {k.value}
              </span>
            </div>
          ))}
        </div>

        {/* Machine / account info strip */}
        <div className="bg-surface-container-lowest border border-outline-variant shadow-sm p-space-md flex flex-col gap-space-xs font-code-tabular text-body-sm text-on-surface-variant">
          {latest ? (
            <>
              <span>machine : {shortMachine(latest.machineId)}</span>
              <span>version app : {latest.appVersion || "—"}</span>
              <span>
                premier signal : {formatDateTime(latest.firstSeen)} · derniere
                maj : {formatDateTime(latest.updatedAt)}
              </span>
            </>
          ) : (
            <span>
              aucune synchro recue — le client n'a pas encore lance
              l'application depuis la mise en place du telemetry
            </span>
          )}
        </div>

        {/* Non configure section */}
        <div className="flex flex-col bg-surface-container-lowest border border-outline-variant shadow-sm">
          <div className="p-space-md bg-surface-container-low border-b border-outline-variant flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[18px] text-on-surface">
              link_off
            </span>
            <span className="font-headline-md text-headline-md uppercase tracking-tight text-on-surface">
              Fournisseurs non configure(s)
            </span>
            <span className="ml-auto font-body-sm text-body-sm text-outline tabular-nums-code">
              {profile ? `${profile.unconfiguredCount} au total` : "—"}
            </span>
          </div>

          {!profile || profile.unconfiguredCount === 0 ? (
            <div className="p-space-xl font-body-sm text-body-sm text-outline text-center">
              {profile
                ? "Aucun fournisseur non configure — tous les sites actifs ont la recherche pleinement configuree."
                : "Chargement..."}
            </div>
          ) : (
            <div className="p-space-md flex flex-col gap-space-md">
              {snapshots
                .filter((s) => s.unconfigured.length > 0)
                .map((s) => (
                  <div
                    key={s.machineId}
                    className="border border-warning bg-warning-container/40 flex flex-col"
                  >
                    <div className="px-space-md py-space-sm border-b border-warning/40 flex items-center justify-between gap-space-sm">
                      <span className="font-label-sm text-label-sm uppercase text-on-warning-container">
                        Machine {shortMachine(s.machineId)}
                      </span>
                      <span className="font-code-tabular text-body-sm text-on-warning-container">
                        vu le {formatDateTime(s.updatedAt)}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {s.unconfigured.map((site) => (
                        <div
                          key={`${s.machineId}-${site.id}`}
                          className="px-space-md py-space-sm border-b border-warning/20 last:border-b-0 flex flex-col sm:flex-row sm:items-center gap-space-xs sm:gap-space-md"
                        >
                          <span className="font-body-md text-body-md font-semibold text-on-surface min-w-40">
                            {site.name}
                          </span>
                          <span className="font-code-tabular text-body-sm text-on-surface-variant flex-1 break-all">
                            {site.baseUrl || "—"}
                          </span>
                          <span
                            className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase self-start sm:self-auto ${
                              site.username
                                ? "bg-surface-container text-on-surface-variant border-outline-variant"
                                : "bg-error-container text-on-error-container border-error"
                            }`}
                          >
                            {site.username
                              ? `login : ${site.username}`
                              : "pas de login"}
                          </span>
                          <span className="px-space-sm py-0.5 border border-warning bg-warning-container font-label-sm text-label-sm uppercase text-on-warning-container self-start sm:self-auto">
                            recherche absente
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Errors section */}
        <div className="flex flex-col bg-surface-container-lowest border border-outline-variant shadow-sm">
          <div className="p-space-md bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px] text-on-surface">
                bug_report
              </span>
              <span className="font-headline-md text-headline-md uppercase tracking-tight text-on-surface">
                Erreurs signalees
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-outline tabular-nums-code">
              {errors === null
                ? "Chargement..."
                : `${total} resultat(s) · page ${page}/${totalPages}`}
            </span>
          </div>

          {/* Toolbar */}
          <div className="p-space-md border-b border-outline-variant flex flex-col lg:flex-row lg:items-center gap-space-sm">
            <div className="relative flex-1">
              <span className="material-symbols-outlined text-[18px] text-outline absolute left-space-sm top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher : message, fournisseur, requete..."
                className="w-full pl-10 pr-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
              />
            </div>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
              className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
            >
              <option value="">Tous les types</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {/* Table / cards */}
          {errors === null ? (
            <div className="p-space-md font-body-sm text-body-sm text-outline">
              Chargement des erreurs...
            </div>
          ) : errors.length === 0 ? (
            <div className="p-space-xl font-body-sm text-body-sm text-outline text-center">
              Aucune erreur pour ce client avec ces filtres.
            </div>
          ) : (
            <>
              {/* Table (large screens) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      <th className="px-space-md py-space-sm w-10">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleSelectAll}
                          disabled={pageIds.length === 0}
                          title="Tout selectionner (page)"
                          className="w-4 h-4 accent-secondary cursor-pointer"
                        />
                      </th>
                      {[
                        "Date",
                        "Type",
                        "Fournisseur",
                        "Requete",
                        "Message",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-space-md py-space-sm font-label-sm text-label-sm uppercase text-outline"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="px-space-md py-space-sm font-label-sm text-label-sm uppercase text-outline">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e) => (
                      <tr
                        key={e.id}
                        className={`border-b border-outline-variant hover:bg-surface-container-low/40 transition-colors ${
                          selected.has(e.id) ? "cursor-default" : "cursor-pointer"
                        }`}
                        onClick={() => setDetail(e)}
                      >
                        <td
                          className="px-space-md py-space-sm"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggleSelect(e.id)}
                            title="Selectionner cette erreur"
                            className="w-4 h-4 accent-secondary cursor-pointer"
                          />
                        </td>
                        <td className="px-space-md py-space-sm font-code-tabular text-body-sm text-on-surface-variant tabular-nums-code whitespace-nowrap">
                          {formatDateTime(e.createdAt)}
                        </td>
                        <td className="px-space-md py-space-sm">
                          <span className="px-space-sm py-0.5 border border-error bg-error-container text-on-error-container font-label-sm text-label-sm uppercase">
                            {KIND_LABEL[e.kind] ?? e.kind}
                          </span>
                        </td>
                        <td className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">
                          {e.site.name || "—"}
                        </td>
                        <td className="px-space-md py-space-sm font-code-tabular text-body-sm text-on-surface-variant">
                          {e.query ? (
                            <span>
                              {e.field} : {e.query}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface max-w-md truncate"
                          title={e.message}
                        >
                          {e.message}
                        </td>
                        <td className="px-space-md py-space-sm">
                          <div
                            className="flex items-center gap-space-xs"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="Voir le detail"
                              onClick={() => setDetail(e)}
                              className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-secondary"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                visibility
                              </span>
                            </button>
                            <button
                              type="button"
                              title="Supprimer"
                              disabled={deleting || bulkDeleting}
                              onClick={() => void remove(e)}
                              className="p-1 hover:bg-error-container text-on-surface-variant hover:text-error disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                delete
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards (narrow screens) */}
              <div className="md:hidden flex flex-col">
                {errors.map((e) => (
                  <div
                    key={e.id}
                    className={`p-space-md border-b border-outline-variant flex flex-col gap-space-sm ${
                      selected.has(e.id)
                        ? "bg-surface-container-low/60"
                        : "cursor-pointer"
                    }`}
                    onClick={() => setDetail(e)}
                  >
                    <div className="flex items-center justify-between gap-space-sm">
                      <div
                        className="flex items-center gap-space-sm"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(e.id)}
                          onChange={() => toggleSelect(e.id)}
                          title="Selectionner cette erreur"
                          className="w-4 h-4 accent-secondary cursor-pointer"
                        />
                        <span className="px-space-sm py-0.5 border border-error bg-error-container text-on-error-container font-label-sm text-label-sm uppercase">
                          {KIND_LABEL[e.kind] ?? e.kind}
                        </span>
                      </div>
                      <span className="font-code-tabular text-body-sm text-outline tabular-nums-code">
                        {formatDateTime(e.createdAt)}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {e.site.name || "—"}
                      {e.query ? ` · ${e.field} : ${e.query}` : ""}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      {e.message}
                    </span>
                    <div
                      className="flex items-center justify-end gap-space-xs"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Supprimer"
                        disabled={deleting || bulkDeleting}
                        onClick={() => void remove(e)}
                        className="p-1 hover:bg-error-container text-on-surface-variant hover:text-error disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Bulk actions */}
          {selected.size > 0 ? (
            <div className="p-space-md border-t border-outline-variant bg-surface-container-low flex flex-wrap items-center justify-between gap-space-sm">
              <span className="font-body-sm text-body-sm text-on-surface tabular-nums-code">
                {selected.size} erreur(s) selectionnee(s)
              </span>
              <div className="flex items-center gap-space-sm">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  disabled={bulkDeleting}
                  className="px-space-md py-2 border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  Effacer selection
                </button>
                <button
                  type="button"
                  onClick={() => void removeSelected()}
                  disabled={bulkDeleting}
                  className="flex items-center gap-space-xs px-space-md py-2 bg-error text-on-error font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    delete
                  </span>
                  {bulkDeleting
                    ? "Suppression..."
                    : `Supprimer (${selected.size})`}
                </button>
              </div>
            </div>
          ) : null}

          {/* Pagination */}
          {errors !== null && total > LIMIT ? (
            <div className="p-space-md border-t border-outline-variant flex items-center justify-between bg-surface-container-low">
              <button
                type="button"
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  setSelected(new Set());
                }}
                disabled={page <= 1}
                className="px-space-md py-2 border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Precedent
              </button>
              <span className="font-body-sm text-body-sm text-outline tabular-nums-code">
                page {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  setSelected(new Set());
                }}
                disabled={page >= totalPages}
                className="px-space-md py-2 border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Detail drawer */}
      {detail ? (
        <div
          className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-50 flex justify-end transition-opacity"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setDetail(null);
          }}
        >
          <div className="w-full max-w-xl bg-surface-container-lowest h-full border-l-2 border-primary flex flex-col shadow-2xl">
            <div className="p-space-lg border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm uppercase text-outline">
                  DETAIL ERREUR
                </span>
                <h2 className="font-headline-lg text-headline-lg uppercase text-on-surface">
                  {KIND_LABEL[detail.kind] ?? detail.kind}
                </h2>
              </div>
              <button
                type="button"
                className="p-1 hover:bg-surface-container text-on-surface"
                onClick={() => setDetail(null)}
                disabled={deleting || bulkDeleting}
              >
                <span className="material-symbols-outlined text-[24px]">
                  close
                </span>
              </button>
            </div>

            <div className="p-space-lg overflow-y-auto flex flex-col gap-space-lg flex-1">
              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-xs font-code-tabular text-body-sm text-on-surface-variant">
                <span>recue le {formatDateTime(detail.createdAt)}</span>
                <span>version app : {detail.appVersion || "—"}</span>
                <span>machine : {shortMachine(detail.machineId)}</span>
                {detail.clientTs ? (
                  <span>
                    horloge client : {formatDateTime(detail.clientTs)}
                  </span>
                ) : null}
                {detail.hash ? <span>hash : {detail.hash}</span> : null}
              </div>

              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-md">
                <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                  Fournisseur concerne
                </span>
                <div className="flex flex-col gap-space-xs font-code-tabular text-body-sm text-on-surface-variant">
                  <span>nom : {detail.site.name || "—"}</span>
                  <span className="break-all">
                    url : {detail.site.baseUrl || "—"}
                  </span>
                  <span>login : {detail.site.username || "—"}</span>
                  <span>mot de passe : {detail.site.password || "—"}</span>
                </div>
              </div>

              {detail.query ? (
                <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                    Requete
                  </span>
                  <span className="font-code-tabular text-body-sm text-on-surface-variant">
                    champ : {detail.field || "—"}
                  </span>
                  <span className="font-code-tabular text-body-sm text-on-surface break-all">
                    valeur : {detail.query}
                  </span>
                </div>
              ) : null}

              <div className="p-space-md bg-error-container border border-error flex flex-col gap-space-xs">
                <span className="font-label-sm text-label-sm uppercase text-on-error-container font-bold">
                  Message
                </span>
                <span className="font-body-sm text-body-sm text-on-error-container whitespace-pre-wrap break-words">
                  {detail.message}
                </span>
              </div>
            </div>

            <div className="p-space-lg border-t border-outline-variant flex items-center justify-end gap-space-sm bg-surface-container-low">
              <button
                type="button"
                onClick={() => setDetail(null)}
                disabled={deleting || bulkDeleting}
                className="px-space-md py-2 border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void remove(detail)}
                disabled={deleting || bulkDeleting}
                className="flex items-center gap-space-xs px-space-md py-2 bg-error text-on-error font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">
                  delete
                </span>
                {deleting ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
