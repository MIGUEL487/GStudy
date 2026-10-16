const grid = (size: number, steps: number) => Array.from({ length: steps - 1 }, (_, i) => <path key={i} d={`M${(i+1)*size/steps} 0V${size} M0 ${(i+1)*size/steps}H${size}`} />);
export function LearningConceptVisual({ topic }: { topic: string }) {
  const name = topic.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pitagor|hipotenusa|cateto/.test(name)) return <figure className="concept-visual">
    <svg viewBox="0 0 390 385" role="img" aria-labelledby="pythagoras-title" aria-describedby="pythagoras-description">
      <title id="pythagoras-title">As áreas no teorema de Pitágoras</title><desc id="pythagoras-description">Triângulo retângulo com catetos 3 e 4 e hipotenusa 5. Os quadrados dos catetos têm 9 e 16 unidades de área, que somam as 25 unidades do quadrado da hipotenusa.</desc>
      <g fill="none" strokeWidth="1"><g transform="translate(40 140)" stroke="#62815c"><rect width="90" height="90" />{grid(90,3)}</g><g transform="translate(130 230)" stroke="#a35d52"><rect width="120" height="120" />{grid(120,4)}</g><g transform="matrix(-.8 -.6 .6 -.8 250 230)" stroke="#527d98"><rect width="150" height="150" />{grid(150,5)}</g></g>
      <path d="M130 140V230H250Z M130 218H142V230" fill="var(--card)" stroke="#71573e" strokeWidth="2" />
      <g fontFamily="Inter,sans-serif" textAnchor="middle" fontSize="14" fill="#57432e"><text x="85" y="126">3² = 9</text><text x="190" y="371">4² = 16</text><text x="284" y="58">5² = 25</text><text x="117" y="189">3</text><text x="190" y="219">4</text><text x="198" y="173">5</text></g>
    </svg><figcaption><b>9 + 16 = 25.</b> A soma das áreas dos quadrados sobre os catetos é igual à área do quadrado sobre a hipotenusa. A relação vale para triângulos retângulos.</figcaption>
  </figure>;
  if (/radiano|circulo trigonometrico|circunferencia|\bpi\b|π/.test(name)) return <figure className="concept-visual">
    <svg viewBox="0 0 340 295" role="img" aria-labelledby="radians-title" aria-describedby="radians-description"><title id="radians-title">O que significa um radiano</title><desc id="radians-description">Um radiano é o ângulo central cujo arco tem o mesmo comprimento do raio. Uma volta completa mede 2π radianos.</desc>
      <g fill="none" stroke="#d3c6b4"><path d="M35 140H300 M160 25V255" /><circle cx="160" cy="140" r="95" /></g><g fill="none" strokeWidth="2" stroke="#527d98"><path d="M160 140H255 M160 140L211.33 60.06" /><path d="M255 140A95 95 0 0 0 211.33 60.06" stroke="#a35d52" strokeWidth="4" /><path d="M192 140A32 32 0 0 0 177.29 113.07" /></g><g fontFamily="Inter,sans-serif" fontSize="12" fill="#57432e"><text x="205" y="158">raio r</text><text x="224" y="87" fill="#a35d52">arco = r</text><text x="181" y="120">1 rad</text><text x="82" y="282">2π rad = 360° · π rad = 180°</text></g>
    </svg><figcaption><b>Um radiano conecta arco e raio.</b> Quando o arco mede o mesmo que o raio, o ângulo central mede 1 radiano. Como a circunferência mede 2πr, uma volta tem 2π radianos.</figcaption>
  </figure>;
  return null;
}
