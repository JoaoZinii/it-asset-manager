import { useEffect, useState } from 'react';

// Matiz estável a partir da marca (Dell sempre com a mesma cor, etc.)
const hueOf = (text = '') => [...text.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function DeviceArt({ type, brand, hue }) {
  const label = (brand || '').toUpperCase().slice(0, 9);
  const screen = `hsl(${hue} 70% 52%)`;
  return (
    <svg viewBox="0 0 240 150" role="img" aria-label={`Ilustração de ${type === 'desktop' ? 'desktop' : 'notebook'}`}>
      <defs>
        <linearGradient id={`g${hue}${type}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={screen} />
          <stop offset="1" stopColor={`hsl(${(hue + 40) % 360} 75% 38%)`} />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="132" rx="86" ry="7" fill="#000" opacity=".14" />
      {type === 'desktop' ? (
        <>
          <rect x="190" y="58" width="28" height="66" rx="5" fill="#e3e9f2" />
          <circle cx="204" cy="72" r="3.5" fill="#9fb0c6" />
          <rect x="196" y="100" width="16" height="3" rx="1.5" fill="#9fb0c6" />
          <rect x="52" y="20" width="126" height="84" rx="7" fill="#1d2b42" />
          <rect x="58" y="26" width="114" height="68" rx="3" fill={`url(#g${hue}${type})`} />
          <text x="115" y="66" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" opacity=".92" fontFamily="system-ui, sans-serif">{label}</text>
          <rect x="106" y="104" width="18" height="16" fill="#aab6c8" />
          <rect x="86" y="119" width="58" height="8" rx="4" fill="#cfd8e6" />
        </>
      ) : (
        <>
          <rect x="58" y="22" width="124" height="82" rx="8" fill="#1d2b42" />
          <rect x="64" y="28" width="112" height="70" rx="3" fill={`url(#g${hue}${type})`} />
          <text x="120" y="68" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" opacity=".92" fontFamily="system-ui, sans-serif">{label}</text>
          <path d="M40 106h160l-11 16a6 6 0 0 1-5 3H56a6 6 0 0 1-5-3z" fill="#cfd8e6" />
          <rect x="102" y="106" width="36" height="4" rx="2" fill="#aab6c8" />
        </>
      )}
    </svg>
  );
}

/** Foto do equipamento; sem foto (ou se a URL falhar) mostra uma ilustração colorida pela marca. */
export default function AssetPhoto({ asset, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [asset.photo_url, asset.model_photo_url]);
  const hue = hueOf(asset.brand);
  const src = asset.photo_url || asset.model_photo_url;
  const showImage = Boolean(src) && !failed;
  return (
    <div className={`photo ${className}${showImage ? ' has-photo' : ''}`} style={{ '--h': hue }}>
      {showImage ? (
        <img src={src} alt={`Foto de ${asset.brand} ${asset.model}`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <DeviceArt type={asset.type} brand={asset.brand} hue={hue} />
      )}
    </div>
  );
}
