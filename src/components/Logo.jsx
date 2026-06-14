import ph1Logo from '../assets/ph1Logo.jpg'
import ph1LogoWhite from '../assets/ph1WorldWhite.png'

const heights = { sm: 30, md: 44, lg: 88 }

export default function Logo({ size = 'md', variant = 'light' }) {
  const h = heights[size] ?? heights.md

  // Red topbar (#ed6055): use the dedicated white-logo asset directly.
  if (variant === 'white') {
    return (
      <img
        src={ph1LogoWhite}
        alt="PH1 World Developers"
        style={{ height: h, width: 'auto', display: 'block' }}
        draggable={false}
      />
    )
  }

  // Near-black surfaces (sidebar #111111, loading screen, sign-in panel):
  // multiply kills the colours, so wrap in a white pill instead.
  if (variant === 'light') {
    const pad = Math.round(h * 0.12)
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: 10,
          padding: `${pad}px ${Math.round(pad * 1.4)}px`,
        }}
      >
        <img
          src={ph1Logo}
          alt="PH1 World Developers"
          style={{ height: h, width: 'auto', display: 'block' }}
          draggable={false}
        />
      </div>
    )
  }

  // Light / white page backgrounds (unauthorized, mobile auth): natural colours.
  return (
    <img
      src={ph1Logo}
      alt="PH1 World Developers"
      style={{ height: h, width: 'auto', display: 'block' }}
      draggable={false}
    />
  )
}
