import './AiLogo.css'

type AiLogoProps = {
  size?: 'sm' | 'md'
}

export default function AiLogo({ size = 'md' }: AiLogoProps) {
  return (
    <div className={`ai-logo ai-logo--${size}`} aria-hidden="true">
      <span className="ai-logo__ring ai-logo__ring--outer" />
      <span className="ai-logo__ring ai-logo__ring--inner" />
      <span className="ai-logo__core" />
    </div>
  )
}
