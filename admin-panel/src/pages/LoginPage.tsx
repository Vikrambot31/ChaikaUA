import { FormEvent, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { isGoogleOnlyAuthMode, signInAdmin, signInWithGoogle } from '../services/authService';

type LoginPageProps = {
  deniedError?: string | null;
};

const getLoginError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) {
    return 'Неверный email или пароль.';
  }
  if (/auth\/too-many-requests/i.test(message)) {
    return 'Слишком много попыток входа. Попробуйте позже.';
  }
  if (/auth\/popup-closed-by-user/i.test(message)) {
    return 'Окно входа Google было закрыто.';
  }
  if (/auth\/popup-blocked/i.test(message)) {
    return 'Браузер заблокировал popup. Разрешите всплывающие окна для этого сайта.';
  }
  return 'Не удалось войти. Проверьте данные и повторите.';
};

export const LoginPage = ({ deniedError }: LoginPageProps) => {
  const googleOnly = isGoogleOnlyAuthMode();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await signInAdmin(email, password);
    } catch (loginError) {
      setError(getLoginError(loginError));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(getLoginError(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={handleSubmit}>
        <p className="eyebrow">Chaika Life</p>
        <div className="headingWithHint">
          <h1>Админ-панель</h1>
          <InfoHint text="Вход только для владельца или аккаунтов с ролью admin/moderator в Firebase." />
        </div>
        <p className="loginText">
          {googleOnly ? 'Вход через Google для владельца или разрешенного администратора.' : 'Вход для администратора или модератора Firebase.'}
        </p>

        {!googleOnly ? (
          <>
            <label className="field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                type="email"
                required
              />
            </label>

            <label className="field">
              <span>Пароль</span>
              <input
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                type="password"
                required
              />
            </label>
          </>
        ) : null}

        {(error || deniedError) ? <p className="formError">{error || deniedError}</p> : null}

        {!googleOnly ? (
          <button className="primaryButton" type="submit" disabled={busy}>
            {busy ? 'Проверка...' : 'Войти по email'}
          </button>
        ) : null}

        {!googleOnly ? <div className="divider" /> : null}

        <button className="secondaryButton" type="button" disabled={busy} onClick={() => void handleGoogleLogin()}>
          {busy ? 'Проверка...' : 'Войти через Google'}
        </button>
      </form>
    </main>
  );
};
