import './AppFooter.css'

const NAME = 'Sumit Khinchi'

export default function AppFooter() {
  return (
    <footer className="credit-badge" aria-label="Developed by Sumit Khinchi">
      <div className="credit-badge__ring" aria-hidden="true" />
      <div className="credit-badge__card">
        <div className="credit-badge__avatar" aria-hidden="true">
          <span className="credit-badge__avatar-text">SK</span>
          <span className="credit-badge__avatar-pulse" />
        </div>

        <div className="credit-badge__content">
          <span className="credit-badge__label">
            <span className="credit-badge__spark" aria-hidden="true">
              ✦
            </span>
            Crafted by
          </span>
          <p className="credit-badge__name" aria-label={NAME}>
            {NAME.split('').map((char, i) => (
              <span
                key={`${char}-${i}`}
                className="credit-badge__char"
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  )
}
