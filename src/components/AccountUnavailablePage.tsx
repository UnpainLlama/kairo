type Props = { onRetry: () => void };

export default function AccountUnavailablePage({ onRetry }: Props) {
  return (
    <main className="kc-account-unavailable" role="alert">
      <section className="kc-account-unavailable-panel" aria-labelledby="kc-account-unavailable-title">
        <span className="kc-section-kicker">ACCOUNT CHECK</span>
        <h1 id="kc-account-unavailable-title">Account status unavailable</h1>
        <p>Kairo could not verify your session. Your account and guest data stay locked until verification succeeds. Check your connection, then retry.</p>
        <button className="kc-btn kc-btn-primary" type="button" onClick={onRetry}>Retry</button>
      </section>
    </main>
  );
}
