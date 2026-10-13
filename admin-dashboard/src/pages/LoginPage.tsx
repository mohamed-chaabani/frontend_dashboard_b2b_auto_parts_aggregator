import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setToken } from '../lib/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api.adminLogin(email.trim(), password);
      setToken(token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-space-lg bg-background">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-sm flex flex-col"
      >
        <div className="p-space-xl border-b border-outline-variant bg-surface-container-low flex flex-col gap-space-xs">
          <span className="font-label-sm text-label-sm uppercase text-secondary">
            ESPACE ADMINISTRATEUR
          </span>
          <h1 className="font-headline-lg text-headline-lg uppercase text-on-surface">
            Dashboard abonnements
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            B2B Auto Parts Aggregator — gestion des souscripteurs
          </p>
        </div>

        <div className="p-space-xl flex flex-col gap-space-lg">
          <label className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase text-outline">
              Email
            </span>
            <input
              className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>

          <label className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase text-outline">
              Mot de passe
            </span>
            <input
              className="px-space-md py-2 border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-secondary focus:outline-none"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="p-space-sm bg-error-container text-on-error-container font-body-sm text-body-sm border border-error">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-space-sm px-space-md py-2 bg-primary-container text-surface-lowest font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            {busy ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </form>
    </div>
  );
}
