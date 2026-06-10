import './AiBackground.css'

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${8 + ((i * 17) % 84)}%`,
  top: `${12 + ((i * 23) % 76)}%`,
  delay: `${(i % 6) * 0.7}s`,
  duration: `${4 + (i % 5)}s`,
}))

export default function AiBackground() {
  return (
    <div className="ai-bg" aria-hidden="true">
      <div className="ai-bg__orb ai-bg__orb--1" />
      <div className="ai-bg__orb ai-bg__orb--2" />
      <div className="ai-bg__orb ai-bg__orb--3" />
      <div className="ai-bg__grid" />
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="ai-bg__particle"
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
      <svg className="ai-bg__network" viewBox="0 0 400 200" preserveAspectRatio="none">
        <path className="ai-bg__line ai-bg__line--1" d="M0,100 Q100,40 200,100 T400,100" />
        <path className="ai-bg__line ai-bg__line--2" d="M0,140 Q150,80 300,140 T400,120" />
        <path className="ai-bg__line ai-bg__line--3" d="M0,60 Q120,120 240,60 T400,80" />
      </svg>
    </div>
  )
}
