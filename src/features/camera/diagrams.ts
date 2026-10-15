// Dibujos de cada toma (SVG). Contenido fijo de la app, nunca texto del usuario.
const cam=(x: number,y: number,d=0,s=1)=>`<g transform="translate(${x} ${y}) rotate(${d}) scale(${s})"><rect x="-9" y="-7" width="13" height="14" rx="2.5" class="c"/><path d="M4 -4.5 L12 -8 L12 8 L4 4.5Z" class="c"/></g>`;
const topP=(x=110,y=60)=>`<ellipse cx="${x}" cy="${y}" rx="13" ry="6" class="s" opacity=".35"/><circle cx="${x}" cy="${y}" r="7" class="s"/>`;
const arrow=(d: string,cls='a')=>`<path d="${d}" class="${cls}" marker-end="url(#ah)"/>`;
const defs=`<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" class="af"/></marker></defs>`;
const fov=(x: number,y: number,d: number,ang: number,len=70)=>{const r=(a: number)=>a*Math.PI/180;const a1=r(d-ang/2),a2=r(d+ang/2);return `<path d="M${x} ${y} L${x+len*Math.cos(a1)} ${y+len*Math.sin(a1)} L${x+len*Math.cos(a2)} ${y+len*Math.sin(a2)}Z" class="fov"/>`};
// persona de pie (de frente), alto 100 unidades: cabeza 0-14
const person=`<g><circle cx="0" cy="7" r="7" class="s"/><path d="M-11 18 Q0 13 11 18 L13 52 L7 52 L6 98 L1 98 L0 58 L-1 98 L-6 98 L-7 52 L-13 52Z" class="s"/></g>`;
function shot(a: number,b: number){ // muestra la franja a..b del cuerpo dentro del cuadro 160x110
  const H=110,sc=H/(b-a);const extra=b-a>140;
  return `<svg viewBox="0 0 160 110">${extra?'<path d="M0 82 L160 82" class="g"/><path d="M0 70 Q40 55 80 66 T160 60" class="gd"/>':''}<g transform="translate(80 ${-a*sc}) scale(${sc})">${person}</g><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`;
}
const side=(camX: number,camY: number,deg: number,extra='')=>`<svg viewBox="0 0 160 110">${defs}<path d="M0 100 L160 100" class="g"/><g transform="translate(110 30) scale(.7)">${person}</g>${extra}${cam(camX,camY,deg)}<path d="M${camX} ${camY} L110 ${36}" class="gd"/></svg>`;
const topv=(body: string)=>`<svg viewBox="0 0 160 110">${defs}${body}</svg>`;

export const DIAGRAMS: Record<string, () => string> = {
  // planos
  ews:()=>shot(-160,260), ws:()=>shot(-25,125), fs:()=>shot(-8,106), cowboy:()=>shot(-6,72), ms:()=>shot(-5,54), mcu:()=>shot(-4,36), cu:()=>shot(-3,24), ecu:()=>shot(3,13),
  detail:()=>`<svg viewBox="0 0 160 110"><circle cx="80" cy="55" r="34" class="s" opacity=".15"/><path d="M58 55 Q80 30 102 55 Q80 80 58 55Z" class="s2"/><circle cx="80" cy="55" r="9" class="s"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  two:()=>`<svg viewBox="0 0 160 110"><g transform="translate(55 6) scale(1.05)">${person}</g><g transform="translate(105 6) scale(1.05)">${person}</g><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  // ángulos
  eye:()=>side(35,35,0), high:()=>side(40,6,32), low:()=>side(40,96,-38), overhead:()=>`<svg viewBox="0 0 160 110">${topP(80,70)}${cam(80,14,90)}<path d="M80 22 L80 60" class="gd"/><text x="98" y="18" class="t">desde arriba</text></svg>`,
  worm:()=>side(70,98,-62), dutch:()=>`<svg viewBox="0 0 160 110"><g transform="rotate(-14 80 55)"><rect x="18" y="12" width="124" height="86" rx="6" class="frame"/><g transform="translate(80 22) scale(.7)">${person}</g><path d="M18 88 L142 88" class="g"/></g></svg>`,
  ots:()=>topv(`${topP(50,62)}${topP(118,44)}${cam(28,74,-25)}<path d="M36 70 L112 47" class="gd"/><text x="12" y="100" class="t">detrás del hombro</text>`),
  pov:()=>`<svg viewBox="0 0 160 110"><path d="M20 55 Q80 0 140 55 Q80 110 20 55Z" class="s2"/><circle cx="80" cy="55" r="16" class="c"/><circle cx="80" cy="55" r="6" class="s"/><text x="40" y="104" class="t">lo que ve el personaje</text></svg>`,
  // movimientos
  static:()=>topv(`${topP()}${cam(35,60)}${fov(35,60,0,40,85)}<text x="22" y="100" class="t">no se mueve</text>`),
  pan:()=>topv(`${topP()}${cam(45,60)}${fov(45,60,0,36,75)}${arrow('M45 30 A30 30 0 0 1 72 46')}<text x="20" y="100" class="t">gira sobre sí misma</text>`),
  tilt:()=>`<svg viewBox="0 0 160 110">${defs}<path d="M0 100 L160 100" class="g"/><g transform="translate(110 30) scale(.7)">${person}</g>${cam(40,60,0)}${arrow('M64 82 A30 30 0 0 0 64 38')}<text x="10" y="106" class="t">gira arriba / abajo</text></svg>`,
  dollyin:()=>topv(`${topP(125,60)}${cam(25,60)}${arrow('M40 60 L95 60')}<text x="20" y="100" class="t">avanza hacia ella</text>`),
  dollyout:()=>topv(`${topP(125,60)}${cam(70,60)}${arrow('M55 60 L18 60')}<text x="20" y="100" class="t">se aleja</text>`),
  truck:()=>topv(`${topP(110,30)}${cam(50,40,-20)}${arrow('M50 55 L50 92')}${arrow('M110 45 L110 82','cd')}<text x="64" y="104" class="t">de lado</text>`),
  crane:()=>`<svg viewBox="0 0 160 110">${defs}<path d="M0 100 L160 100" class="g"/><g transform="translate(110 30) scale(.7)">${person}</g>${cam(40,80,-10)}${arrow('M40 66 L40 18')}<text x="52" y="22" class="t">sube</text></svg>`,
  zoom:()=>topv(`${topP(125,60)}${cam(30,60)}${fov(30,60,0,60,95)}${fov(30,60,0,16,95)}<text x="14" y="100" class="t">solo cambia la lente</text>`),
  vertigo:()=>topv(`${topP(115,60)}${cam(30,60)}${arrow('M44 74 L80 74')}${fov(30,60,0,52,85)}<text x="14" y="102" class="t">avanza + aleja el zoom</text>`),
  orbit:()=>topv(`<circle cx="95" cy="55" r="40" class="cd"/>${topP(95,55)}${cam(95,15,90)}${arrow('M128 32 A40 40 0 0 1 135 58')}`),
  arc:()=>topv(`<path d="M55 30 A45 45 0 0 0 55 80" class="cd"/>${topP(100,55)}${cam(60,24,40)}${arrow('M48 48 A45 45 0 0 0 52 72')}<text x="70" y="104" class="t">medio círculo</text>`),
  follow:()=>topv(`${topP(110,60)}${cam(50,60)}${arrow('M120 74 L150 74')}${arrow('M60 74 L90 74')}<text x="20" y="100" class="t">la sigue igual de cerca</text>`),
  handheld:()=>topv(`${topP()}${cam(40,58)}<path d="M20 86 q6 -8 12 0 t12 0 t12 0 t12 0" class="a"/><text x="78" y="100" class="t">tiembla poquito</text>`),
  whip:()=>topv(`${topP(120,60)}${cam(45,60)}${arrow('M45 28 A32 32 0 0 1 77 60')}<path d="M70 20 L90 20 M74 28 L96 28 M78 36 L100 36" class="g"/><text x="14" y="100" class="t">giro rapidísimo</text>`),
  crash:()=>topv(`${topP(125,60)}${cam(30,60)}${fov(30,60,0,12,95)}${arrow('M44 84 L104 84')}<text x="14" y="104" class="t">zoom de golpe</text>`),
  drone:()=>`<svg viewBox="0 0 160 110">${defs}<path d="M0 100 L160 100" class="g"/><g transform="translate(120 64) scale(.35)">${person}</g><g transform="translate(40 16)"><path d="M-16 0 L16 0" class="cl"/><circle cx="-16" cy="-2" r="5" class="cd"/><circle cx="16" cy="-2" r="5" class="cd"/></g>${cam(40,26,40,.8)}${arrow('M56 14 L120 14')}</svg>`,
  fpv:()=>topv(`${topP(130,40)}${cam(20,80,-30)}<path d="M28 74 C60 40, 70 100, 110 50" class="a" marker-end="url(#ah)"/><text x="30" y="104" class="t">vuela rápido entre cosas</text>`),
  bullet:()=>topv(`<circle cx="95" cy="55" r="40" class="cd"/>${topP(95,55)}${cam(58,38,25)}${arrow('M70 18 A40 40 0 0 1 128 30')}<text x="10" y="104" class="t">todo congelado + gira</text>`),
  snorri:()=>topv(`${topP(110,60)}<path d="M103 60 L70 60" class="cl"/>${cam(60,60)}<text x="20" y="100" class="t">pegada al cuerpo</text>`),
  through:()=>topv(`<rect x="72" y="25" width="10" height="60" rx="2" class="s" opacity=".3"/><rect x="72" y="45" width="10" height="20" class="s" opacity="0"/>${topP(130,55)}${cam(30,55)}${arrow('M44 55 L112 55')}<text x="14" y="100" class="t">cruza ventana / puerta</text>`),
  reveal:()=>topv(`${topP(130,55)}<rect x="60" y="30" width="22" height="50" rx="3" class="s" opacity=".3"/>${cam(35,80)}${arrow('M35 66 L35 22')}<text x="14" y="104" class="t">sale de atrás de algo</text>`),
  // lentes
  wide:()=>topv(`${topP(110,50)}${cam(30,58)}${fov(30,58,0,95,90)}<text x="14" y="104" class="t">16–24 mm · ve mucho</text>`),
  normal:()=>topv(`${topP(110,58)}${cam(30,58)}${fov(30,58,0,45,90)}<text x="14" y="104" class="t">35–50 mm · como el ojo</text>`),
  tele:()=>topv(`${topP(140,58)}${cam(14,58)}${fov(14,58,0,12,130)}<text x="14" y="104" class="t">85–200 mm · comprime</text>`),
  fisheye:()=>`<svg viewBox="0 0 160 110"><circle cx="80" cy="55" r="48" class="frame"/><path d="M40 30 Q80 60 120 30 M40 80 Q80 50 120 80 M55 12 Q80 55 55 98 M105 12 Q80 55 105 98" class="g"/><circle cx="80" cy="55" r="8" class="s"/></svg>`,
  shallow:()=>`<svg viewBox="0 0 160 110"><circle cx="30" cy="30" r="14" class="c" opacity=".2"/><circle cx="130" cy="24" r="10" class="c" opacity=".25"/><circle cx="125" cy="80" r="16" class="c" opacity=".18"/><circle cx="35" cy="85" r="11" class="c" opacity=".2"/><g transform="translate(80 18) scale(.8)">${person}</g><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  deep:()=>`<svg viewBox="0 0 160 110"><g transform="translate(50 30) scale(.65)">${person}</g><g transform="translate(118 52) scale(.35)">${person}</g><path d="M0 92 L160 92" class="g"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  rack:()=>`<svg viewBox="0 0 160 110"><g transform="translate(45 20) scale(.75)">${person}</g><g transform="translate(120 42) scale(.45)" opacity=".35">${person}</g>${'<path d="M70 100 L100 100" class="a" marker-end="url(#ah)"/>'}${defs}<rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  macro:()=>`<svg viewBox="0 0 160 110"><circle cx="80" cy="55" r="30" class="s" opacity=".2"/><circle cx="80" cy="55" r="3" class="s"/><path d="M80 25 L80 85 M50 55 L110 55" class="g"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/><text x="10" y="104" class="t">muy, muy de cerca</text></svg>`,
  anamorphic:()=>`<svg viewBox="0 0 160 110"><rect x="1.5" y="22" width="157" height="66" rx="6" class="frame"/><path d="M10 55 L150 55" class="c" stroke="#38bdd8" stroke-width="2" opacity=".7"/><circle cx="80" cy="55" r="6" class="c"/><text x="10" y="104" class="t">pantalla ancha + destello</text></svg>`,
  // composición
  thirds:()=>`<svg viewBox="0 0 160 110"><path d="M53 0 V110 M107 0 V110 M0 37 H160 M0 73 H160" class="gd"/><circle cx="107" cy="37" r="7" class="af"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  center:()=>`<svg viewBox="0 0 160 110"><path d="M80 0 V110" class="gd"/><g transform="translate(80 22) scale(.75)">${person}</g><path d="M20 98 L60 30 M140 98 L100 30" class="g"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  leading:()=>`<svg viewBox="0 0 160 110"><path d="M0 110 L80 50 L160 110 M30 110 L80 50 L130 110" class="g"/><circle cx="80" cy="46" r="6" class="af"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  framein:()=>`<svg viewBox="0 0 160 110"><rect x="40" y="18" width="80" height="80" rx="4" class="s2"/><g transform="translate(80 34) scale(.6)">${person}</g><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  lookroom:()=>`<svg viewBox="0 0 160 110">${defs}<g transform="translate(45 20) scale(.85)">${person}</g>${arrow('M70 30 L140 30')}<text x="80" y="22" class="t">espacio para mirar</text><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  sym:()=>`<svg viewBox="0 0 160 110"><path d="M80 0 V110" class="gd"/><rect x="20" y="30" width="30" height="60" class="s" opacity=".25"/><rect x="110" y="30" width="30" height="60" class="s" opacity=".25"/><circle cx="80" cy="55" r="9" class="s"/><rect x="1.5" y="1.5" width="157" height="107" rx="6" class="frame"/></svg>`,
  // luz
  natural:()=>`<svg viewBox="0 0 160 110"><circle cx="30" cy="25" r="12" class="af"/><path d="M42 30 L90 50 M40 38 L88 60" class="a"/><g transform="translate(110 30) scale(.65)">${person}</g></svg>`,
  golden:()=>`<svg viewBox="0 0 160 110"><path d="M0 80 H160" class="g"/><circle cx="25" cy="78" r="14" class="af"/><path d="M40 72 L95 60" class="a"/><g transform="translate(110 20) scale(.6)">${person}</g><text x="10" y="104" class="t">sol bajito, luz dorada</text></svg>`,
  backlight:()=>`<svg viewBox="0 0 160 110"><circle cx="80" cy="45" r="30" class="af" opacity=".35"/><g transform="translate(80 18) scale(.75)">${person}</g><text x="40" y="106" class="t">luz detrás = silueta</text></svg>`,
  lowkey:()=>`<svg viewBox="0 0 160 110"><rect width="160" height="110" rx="10" fill="#0b1220"/><path d="M80 25 a8 8 0 0 0 0 16Z" fill="#ff7a33"/><path d="M80 45 L68 50 L66 90 L80 90Z" fill="#ff7a33" opacity=".8"/></svg>`,
  highkey:()=>`<svg viewBox="0 0 160 110"><rect width="160" height="110" rx="10" fill="#e8edf5" stroke="#34496a"/><g transform="translate(80 20) scale(.7)" opacity=".75">${person}</g></svg>`,
  threepoint:()=>topv(`${topP(80,55)}<circle cx="35" cy="25" r="7" class="af"/><circle cx="130" cy="30" r="5" class="af" opacity=".6"/><circle cx="85" cy="12" r="5" class="af" opacity=".8"/><text x="20" y="18" class="t">principal</text><text x="110" y="48" class="t">relleno</text><text x="94" y="10" class="t">contra</text>${cam(80,100,-90)}`),
  rembrandt:()=>`<svg viewBox="0 0 160 110"><ellipse cx="80" cy="55" rx="30" ry="40" class="s" opacity=".85"/><path d="M80 15 A30 40 0 0 0 80 95 Z" fill="#ff7a33" opacity=".55"/><path d="M90 50 L100 60 L88 64Z" fill="#ff7a33"/><text x="10" y="106" class="t">triángulo en la mejilla</text></svg>`,
  neon:()=>`<svg viewBox="0 0 160 110"><rect width="160" height="110" rx="10" fill="#0b1220"/><path d="M10 10 V100" stroke="#ff3fa4" stroke-width="5"/><path d="M150 10 V100" stroke="#38bdd8" stroke-width="5"/><g transform="translate(80 20) scale(.7)" opacity=".9"><circle cx="0" cy="7" r="7" fill="#c06"/><path d="M-11 18 Q0 13 11 18 L13 52 L-13 52Z" fill="#0aa"/></g></svg>`,
  practical:()=>`<svg viewBox="0 0 160 110"><path d="M40 20 L60 20 L66 40 L34 40Z" class="af"/><path d="M50 40 V90" class="g"/><path d="M50 40 L95 70" class="gd"/><g transform="translate(110 30) scale(.6)">${person}</g><text x="10" y="106" class="t">lámpara en la toma</text></svg>`,
  // tiempo
  slowmo:()=>`<svg viewBox="0 0 160 110"><g opacity=".2"><g transform="translate(40 25) scale(.6)">${person}</g></g><g opacity=".45"><g transform="translate(70 25) scale(.6)">${person}</g></g><g transform="translate(100 25) scale(.6)">${person}</g><text x="10" y="106" class="t">más cuadros = más lento</text></svg>`,
  timelapse:()=>`<svg viewBox="0 0 160 110"><circle cx="80" cy="50" r="34" class="s2"/><path d="M80 50 L80 26 M80 50 L100 60" class="a"/><path d="M20 100 H140" class="g"/><text x="34" y="106" class="t">horas en segundos</text></svg>`,
  hyperlapse:()=>topv(`${cam(20,60)}${arrow('M34 60 L140 60')}<path d="M40 40 L60 40 M70 40 L90 40 M100 40 L120 40" class="g"/><text x="14" y="100" class="t">timelapse caminando</text>`),
  freeze:()=>`<svg viewBox="0 0 160 110"><g transform="translate(80 18) scale(.7)">${person}</g><rect x="20" y="10" width="120" height="90" rx="6" class="frame" stroke-dasharray="6 5"/><text x="58" y="106" class="t">pausa</text></svg>`,
  oner:()=>topv(`${cam(16,90,-40)}<path d="M24 82 C50 20, 90 100, 130 30 C140 15, 150 30, 150 50" class="a"/><text x="40" y="104" class="t">sin cortes</text>`),
  ramp:()=>`<svg viewBox="0 0 160 110"><path d="M10 90 L60 90 L80 30 L100 30 L120 90 L150 90" class="a"/><text x="10" y="104" class="t">normal · lento · normal</text></svg>`,
  // transiciones
  cut:()=>`<svg viewBox="0 0 160 110"><rect x="8" y="25" width="66" height="60" rx="5" class="frame"/><rect x="86" y="25" width="66" height="60" rx="5" class="frame"/><path d="M80 15 V95" class="a"/></svg>`,
  fade:()=>`<svg viewBox="0 0 160 110"><defs><linearGradient id="fg"><stop offset="0" stop-color="#38bdd8"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs><rect x="8" y="25" width="144" height="60" rx="5" fill="url(#fg)"/></svg>`,
  dissolve:()=>`<svg viewBox="0 0 160 110"><rect x="20" y="20" width="80" height="60" rx="5" class="c" opacity=".5"/><rect x="60" y="34" width="80" height="60" rx="5" class="af" opacity=".5"/></svg>`,
  match:()=>`<svg viewBox="0 0 160 110"><circle cx="40" cy="55" r="22" class="s2"/><circle cx="120" cy="55" r="22" class="af" opacity=".7"/><path d="M68 55 L92 55" class="a"/><text x="10" y="100" class="t">misma forma</text></svg>`,
  whipt:()=>`<svg viewBox="0 0 160 110"><path d="M10 40 H150 M20 55 H140 M10 70 H150" class="g"/><path d="M60 30 L100 30" class="a"/><text x="10" y="100" class="t">barrido entre escenas</text></svg>`,
};

