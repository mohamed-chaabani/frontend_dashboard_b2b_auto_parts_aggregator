import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type Plan,
  type PlanId,
  type Stats,
  type User,
  type UserPayload,
} from '../lib/api';
import { clearToken } from '../lib/auth';

const PLAN_CHIP: Record<PlanId, string> = {
  tester: 'bg-surface-container text-on-surface-variant border-outline-variant',
  starter: 'bg-secondary-fixed text-on-secondary-fixed border-secondary-fixed-dim',
  pro: 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-fixed-dim',
  enterprise: 'bg-primary-container text-surface-lowest border-primary-container',
};

const STATUS_CHIP: Record<string, string> = {
  active: 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-fixed-dim',
  expired: 'bg-error-container text-on-error-container border-error',
};

interface FormState {
  name: string;
  username: string;
  phone: string;
  company: string;
  plan: PlanId;
  password: string;
  resetPassword: boolean;
}

const emptyForm = (plan: PlanId = 'starter'): FormState => ({
  name: '',
  username: '',
  phone: '',
  company: '',
  plan,
  password: '',
  resetPassword: false,
});

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
};

export default function UsersPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [drawer, setDrawer] = useState<{ mode: 'new' | 'edit'; user?: User } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planMap = useMemo(() => {
    const m = new Map<PlanId, Plan>();
    for (const p of plans) m.set(p.id, p);
    return m;
  }, [plans]);

  const refresh = useCallback(async () => {
    try {
      const [s, p, u] = await Promise.all([
        api.stats(),
        api.plans(),
        api.users({ status: statusFilter, plan: planFilter, q }),
      ]);
      setStats(s);
      setPlans(p.plans);
      setUsers(u.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    }
  }, [statusFilter, planFilter, q]);

  // Recherche avec debounce
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      void refresh();
      return;
    }
    const t = setTimeout(() => void refresh(), 300);
    return () => clearTimeout(t);
  }, [refresh]);

  const logout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  const openNew = () => {
    const plan = planMap.get('starter') ?? plans[0] ?? null;
    const next = emptyForm(plan ? plan.id : 'starter');
    setForm(next);
    setError(null);
    setDrawer({ mode: 'new' });
  };

  const openEdit = (u: User) => {
    setForm({
      name: u.name,
      username: u.username,
      phone: u.phone,
      company: u.company,
      plan: u.plan,
      password: '',
      resetPassword: false,
    });
    setError(null);
    setDrawer({ mode: 'edit', user: u });
  };

  const onPlanChange = (planId: PlanId) => {
    setForm((f) => ({ ...f, plan: planId }));
  };

  const closeDrawer = () => {
    if (!saving) setDrawer(null);
  };

  const save = async () => {
    if (!drawer) return;
    setError(null);

    if (!form.name.trim() || !form.username.trim() || !form.phone.trim()) {
      setError('Nom, username et telephone sont obligatoires');
      return;
    }
    if (drawer.mode === 'new' && !form.password) {
      setError('Mot de passe obligatoire');
      return;
    }
    if (drawer.mode === 'edit' && form.resetPassword && !form.password) {
      setError('Nouveau mot de passe obligatoire');
      return;
    }

    const payload: UserPayload = {
      name: form.name.trim(),
      username: form.username.trim(),
      phone: form.phone.trim(),
      company: form.company.trim(),
      plan: form.plan,
    };
    if (drawer.mode === 'new') payload.password = form.password;
    if (drawer.mode === 'edit' && form.resetPassword) {
      payload.resetPassword = true;
      payload.password = form.password;
    }

    setSaving(true);
    try {
      if (drawer.mode === 'new') await api.createUser(payload);
      else await api.updateUser(drawer.user!.id, payload);
      setDrawer(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: User) => {
    if (!window.confirm(`Supprimer ${u.name} ?`)) return;
    try {
      await api.deleteUser(u.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const kpis = [
    { label: 'Total abonnes', value: stats ? String(stats.total) : '—', icon: 'group' },
    { label: 'Actifs', value: stats ? String(stats.active) : '—', icon: 'verified' },
    { label: 'Expires', value: stats ? String(stats.expired) : '—', icon: 'timer_off' },
    {
      label: 'Revenu estime (DT)',
      value: stats ? String(stats.revenueEstimated) : '—',
      icon: 'payments',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-space-lg py-space-md flex items-center justify-between gap-space-md">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm uppercase text-secondary">
              B2B AUTO PARTS AGGREGATOR
            </span>
            <h1 className="font-headline-md text-headline-md uppercase text-on-surface">
              Dashboard abonnements
            </h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md text-label-md uppercase tracking-wider border border-outline-variant hover:border-secondary hover:text-secondary transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Deconnexion
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-space-lg py-space-xl flex flex-col gap-space-xl">
        {error ? (
          <div className="p-space-sm bg-error-container text-on-error-container font-body-sm text-body-sm border border-error flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="material-symbols-outlined">
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
              <span className="font-headline-lg text-headline-lg text-on-surface tabular-nums-code">
                {k.value}
              </span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-space-sm">
          <div className="relative flex-1">
            <span className="material-symbols-outlined text-[18px] text-outline absolute left-space-sm top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher : nom, username, telephone, societe..."
              className="w-full pl-10 pr-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="expired">Expires</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
          >
            <option value="">Tous les plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center justify-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md text-label-md uppercase tracking-wider border border-outline-variant hover:border-secondary hover:text-secondary shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">add_circle</span>
            Ajouter un utilisateur
          </button>
        </div>

        {/* Table / cards */}
        <div className="flex flex-col bg-surface-container-lowest border border-outline-variant shadow-sm">
          <div className="p-space-md bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px] text-on-surface">group</span>
              <span className="font-headline-md text-headline-md uppercase tracking-tight text-on-surface">
                Souscripteurs
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-outline tabular-nums-code">
              {users ? `${users.length} resultat(s)` : 'Chargement...'}
            </span>
          </div>

          {users === null ? (
            <div className="p-space-md font-body-sm text-body-sm text-outline">
              Chargement des utilisateurs...
            </div>
          ) : users.length === 0 ? (
            <div className="p-space-xl font-body-sm text-body-sm text-outline text-center">
              Aucun utilisateur — cliquez sur "Ajouter un utilisateur" pour creer le premier
              compte.
            </div>
          ) : (
            <>
              {/* Table (large screens) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['Utilisateur', 'Societe', 'Plan', 'Statut', 'Expiration', 'Actions'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-space-md py-space-sm font-label-sm text-label-sm uppercase text-outline"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-outline-variant hover:bg-surface-container-low/40 transition-colors cursor-pointer"
                        onClick={() => openEdit(u)}
                      >
                        <td className="px-space-md py-space-sm">
                          <div className="flex flex-col">
                            <span className="font-body-md text-body-md font-semibold text-on-surface">
                              {u.name}
                            </span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              @{u.username} · {u.phone}
                            </span>
                          </div>
                        </td>
                        <td className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">
                          {u.company || '—'}
                        </td>
                        <td className="px-space-md py-space-sm">
                          <span
                            className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase ${PLAN_CHIP[u.plan]}`}
                          >
                            {planMap.get(u.plan)?.label ?? u.plan}
                          </span>
                        </td>
                        <td className="px-space-md py-space-sm">
                          <span
                            className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase ${STATUS_CHIP[u.status]}`}
                          >
                            {u.status === 'active' ? 'Actif' : 'Expire'}
                          </span>
                        </td>
                        <td className="px-space-md py-space-sm font-code-tabular text-body-sm text-on-surface-variant tabular-nums-code">
                          {formatDate(u.expiryDate)}
                        </td>
                        <td className="px-space-md py-space-sm">
                          <div className="flex items-center gap-space-xs" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Modifier"
                              onClick={() => openEdit(u)}
                              className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-secondary"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button
                              type="button"
                              title="Supprimer"
                              onClick={() => void remove(u)}
                              className="p-1 hover:bg-error-container text-on-surface-variant hover:text-error"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
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
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-space-md border-b border-outline-variant flex flex-col gap-space-sm cursor-pointer"
                    onClick={() => openEdit(u)}
                  >
                    <div className="flex items-center justify-between gap-space-sm">
                      <span className="font-body-md text-body-md font-semibold text-on-surface">
                        {u.name}
                      </span>
                      <span
                        className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase ${STATUS_CHIP[u.status]}`}
                      >
                        {u.status === 'active' ? 'Actif' : 'Expire'}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      @{u.username} · {u.phone}
                    </span>
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase ${PLAN_CHIP[u.plan]}`}
                      >
                        {planMap.get(u.plan)?.label ?? u.plan}
                      </span>
                      <span className="font-code-tabular text-body-sm text-outline tabular-nums-code">
                        {formatDate(u.expiryDate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Plans section */}
        <div className="flex flex-col bg-surface-container-lowest border border-outline-variant shadow-sm">
          <div className="p-space-md bg-surface-container-low border-b border-outline-variant flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[18px] text-on-surface">sell</span>
            <span className="font-headline-md text-headline-md uppercase tracking-tight text-on-surface">
              Tarifs des abonnements
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={`p-space-md flex flex-col gap-space-xs ${
                  i > 0 ? 'border-t sm:border-t-0 sm:border-l border-outline-variant' : ''
                } ${i === 1 ? 'sm:border-t-0' : ''} ${i === 2 ? 'sm:border-t xl:border-t-0' : ''} ${i === 3 ? 'sm:border-t xl:border-t-0' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-headline-md text-headline-md text-on-surface">
                    {p.label}
                  </span>
                  <span
                    className={`px-space-sm py-0.5 border font-label-sm text-label-sm uppercase ${PLAN_CHIP[p.id]}`}
                  >
                    {stats?.byPlan[p.id] ?? 0} utilisateur(s)
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Duree : {p.months} mois
                </span>
                <span className="font-headline-lg text-headline-lg text-secondary tabular-nums-code">
                  {p.price} DT
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drawer add/edit */}
      {drawer ? (
        <div
          className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-50 flex justify-end transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <div className="w-full max-w-xl bg-surface-container-lowest h-full border-l-2 border-primary flex flex-col shadow-2xl">
            <div className="p-space-lg border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm uppercase text-outline">
                  {drawer.mode === 'new' ? 'NOUVEL UTILISATEUR' : 'MODIFIER UTILISATEUR'}
                </span>
                <h2 className="font-headline-lg text-headline-lg uppercase text-on-surface">
                  {drawer.mode === 'new' ? 'Ajouter un abonne' : drawer.user!.name}
                </h2>
              </div>
              <button
                type="button"
                className="p-1 hover:bg-surface-container text-on-surface"
                onClick={closeDrawer}
                disabled={saving}
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <div className="p-space-lg overflow-y-auto flex flex-col gap-space-lg flex-1">
              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-xs font-code-tabular text-body-sm text-on-surface-variant">
                <span>le statut est calcule automatiquement a partir de la date d'expiration</span>
                <span>pour renouveller : repoussez la date — pour bloquer : mettez une date passee</span>
              </div>

              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-md">
                <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                  Identite
                </span>
                <label className="flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase text-outline">
                    Nom *
                  </span>
                  <input
                    className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ahmed Ben Ali"
                  />
                </label>
                <div className="grid grid-cols-2 gap-space-sm">
                  <label className="flex flex-col gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase text-outline">
                      Username *
                    </span>
                    <input
                      className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="ahmed.garage"
                    />
                    <span className="font-body-sm text-body-sm text-outline">
                      Identifiant de connexion (minuscules)
                    </span>
                  </label>
                  <label className="flex flex-col gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase text-outline">
                      Telephone *
                    </span>
                    <input
                      className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="22 123 456"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase text-outline">
                    Societe
                  </span>
                  <input
                    className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Garage El Manar"
                  />
                </label>
              </div>

              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-md">
                <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                  Abonnement
                </span>
                <label className="flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase text-outline">Plan *</span>
                  <select
                    className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                    value={form.plan}
                    onChange={(e) => onPlanChange(e.target.value as PlanId)}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {p.months} mois / {p.price} DT
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="p-space-md bg-surface-container-low border border-outline-variant flex flex-col gap-space-md">
                <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                  Mot de passe
                </span>
                {drawer.mode === 'edit' ? (
                  <label className="flex items-center gap-space-sm font-body-sm text-body-sm text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={form.resetPassword}
                      onChange={(e) =>
                        setForm({ ...form, resetPassword: e.target.checked, password: '' })
                      }
                    />
                    Reinitialiser le mot de passe
                  </label>
                ) : null}
                {drawer.mode === 'new' || form.resetPassword ? (
                  <label className="flex flex-col gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase text-outline">
                      {drawer.mode === 'new' ? 'Mot de passe *' : 'Nouveau mot de passe *'}
                    </span>
                    <input
                      type="text"
                      className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Str0ng&Pass"
                    />
                    <span className="font-body-sm text-body-sm text-outline">
                      8+ caracteres, majuscule, minuscule, chiffre et caractere special
                    </span>
                  </label>
                ) : null}
              </div>

              {error ? (
                <div className="p-space-sm bg-error-container text-on-error-container font-body-sm text-body-sm border border-error">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="p-space-lg border-t border-outline-variant flex items-center justify-end gap-space-sm bg-surface-container-low">
              <button
                type="button"
                onClick={closeDrawer}
                disabled={saving}
                className="px-space-md py-2 border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="flex items-center gap-space-xs px-space-md py-2 bg-primary-container text-surface-lowest font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
