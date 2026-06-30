// CLASH OF STEEL loading splash — the loading.png art as the full background + a purple progress bar.
export function LoadingScreen({ closing }: { closing?: boolean }) {
  return (
    <div className={'loadscreen ls-img2' + (closing ? ' closing' : '')}>
      <div className="ls-bg2" />
      <div className="ls-barwrap">
        <div className="ls-bar"><div className="ls-fill" /></div>
        <div className="ls-loading">Loading…</div>
      </div>
    </div>
  );
}
