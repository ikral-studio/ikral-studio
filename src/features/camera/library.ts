// Biblioteca de cámara: datos de la investigación «Lenguaje de cámara» (15 oct 2026).
// Cada toma: [id, nombre en español, término en inglés, qué es, para qué, frase para el prompt, preset de Higgsfield?]

export type CameraCategoryId = 'shot' | 'angle' | 'move' | 'lens' | 'composition' | 'light' | 'time' | 'transition'
export type CameraItemRow = [string, string, string, string, string, string, string?]
export interface CameraCategory {
  id: CameraCategoryId
  name: string
  desc: string
  items: CameraItemRow[]
}

export const CAMERA_CATEGORIES: CameraCategory[] = [
 {id:'shot',name:'Tamaño del plano',desc:'Qué tanto del personaje se ve. Del más lejos al más cerca.',items:[
  ['ews','Gran plano general','Extreme wide shot','El lugar completo; la persona se ve chiquita.','Abrir una historia, mostrar dónde estamos.','extreme wide shot, tiny figure in a vast landscape'],
  ['ws','Plano general','Wide shot','La persona entera con mucho espacio alrededor.','Ubicar al personaje en su lugar.','wide shot, full body with the environment around'],
  ['fs','Plano entero','Full shot','De la cabeza a los pies, justo.','Ver la ropa y la postura completa.','full shot, head to toe'],
  ['cowboy','Plano americano','Cowboy shot / 3/4 shot','De la cabeza a las rodillas.','Personajes de pie que hablan o se mueven.','cowboy shot, framed from the knees up'],
  ['ms','Plano medio','Medium shot','De la cintura para arriba.','Conversaciones normales, gestos con las manos.','medium shot, waist up'],
  ['mcu','Plano medio corto','Medium close-up','Del pecho para arriba.','Diálogos con emoción.','medium close-up, chest up'],
  ['cu','Primer plano','Close-up','La cara llena el cuadro.','Emoción fuerte, reacción.','close-up on the face'],
  ['ecu','Primerísimo primer plano','Extreme close-up','Solo ojos o boca.','Tensión, un detalle de la emoción.','extreme close-up on the eyes'],
  ['detail','Plano detalle','Insert / detail shot','Un objeto o parte pequeña: manos, celular, comida.','Mostrar algo importante (la app en el celular).','insert shot, detail of the phone screen in hands'],
  ['two','Plano de dos','Two shot','Dos personas juntas en el cuadro.','Mostrar la relación entre ellos.','two shot, both characters in frame'],
 ]},
 {id:'angle',name:'Ángulo',desc:'Desde dónde mira la cámara: arriba, abajo, de lado.',items:[
  ['eye','Normal','Eye level','A la altura de los ojos.','Neutral, natural.','eye-level shot'],
  ['high','Picado','High angle','La cámara mira desde arriba hacia abajo.','La persona se ve pequeña o vulnerable.','high angle shot looking down at the subject'],
  ['low','Contrapicado','Low angle','La cámara mira desde abajo hacia arriba.','La persona se ve fuerte, poderosa, heroica.','low angle shot looking up at the subject, heroic'],
  ['overhead','Cenital','Overhead / top shot','Justo encima, mirando al piso.','Mesas, comida, coreografías, mapas.','overhead top-down shot, bird\'s-eye view'],
  ['worm','Nadir','Worm\'s-eye view','Desde el piso hacia el cielo.','Edificios enormes, algo imponente.','worm\'s-eye view from the ground'],
  ['dutch','Holandés (inclinado)','Dutch angle','El cuadro está chueco a propósito.','Algo anda mal, confusión, locura.','dutch angle, tilted horizon'],
  ['ots','Sobre el hombro','Over-the-shoulder','Vemos a uno por detrás del hombro del otro.','Conversaciones entre dos.','over-the-shoulder shot'],
  ['pov','Subjetivo','POV shot','Vemos lo que ve el personaje.','Meter al público en sus ojos.','first-person POV shot'],
 ]},
 {id:'move',name:'Movimiento de cámara',desc:'Lo que hace la cámara durante la toma. Elige uno principal por escena.',items:[
  ['static','Fija','Static / locked-off','La cámara no se mueve nada.','Calma, observar, diálogos.','static locked-off camera, no movement','Static'],
  ['pan','Paneo','Pan left / right','Gira a los lados sin cambiar de lugar.','Seguir algo o mostrar un lugar.','slow pan right, camera stays in place','Pan Right'],
  ['tilt','Tilt (paneo vertical)','Tilt up / down','Gira hacia arriba o abajo sin cambiar de lugar.','Revelar algo alto (edificio, persona).','slow tilt up, no camera travel','Tilt up'],
  ['dollyin','Dolly in (acercarse)','Dolly in / push in','La cámara avanza hacia el personaje.','Más intimidad o tensión. No es lo mismo que zoom.','slow dolly in toward the subject, constant speed, no zoom','Dolly In'],
  ['dollyout','Dolly out (alejarse)','Dolly out / pull back','La cámara retrocede.','Revelar el lugar, terminar una escena.','slow dolly out, pulling back to reveal the room','Dolly Out'],
  ['truck','Travelling lateral','Truck / tracking sideways','La cámara camina de lado, en paralelo.','Acompañar a alguien que camina.','lateral tracking shot, camera moves sideways parallel to the subject','Dolly Right'],
  ['follow','Seguimiento','Tracking / follow shot','La cámara va detrás o delante siguiendo.','Persecuciones, caminatas.','tracking shot following the subject from behind','Head Tracking'],
  ['crane','Grúa (sube / baja)','Crane up / down, jib','La cámara sube o baja como en un elevador.','Inicio o final épico.','crane up rising above the scene','Crane Up'],
  ['zoom','Zoom','Zoom in / out','La lente acerca o aleja; la cámara no se mueve.','Llamar la atención a algo.','smooth optical zoom in, camera does not move','Zoom In'],
  ['crash','Zoom de golpe','Crash zoom','Zoom rapidísimo.','Sorpresa, comedia, impacto.','fast crash zoom in on the face','Crash Zoom In'],
  ['vertigo','Efecto vértigo','Dolly zoom','Avanza y hace zoom al revés: el fondo se estira.','Mareo, descubrimiento impactante.','dolly zoom, vertigo effect, background stretches','Dolly Zoom In'],
  ['orbit','Orbital 360°','360 orbit','Da la vuelta completa alrededor del personaje.','Bailes, presentaciones, momentos épicos (tu idea del reloj).','smooth 360-degree orbit around the subject, constant radius and speed, subject stays centered','360 Orbit'],
  ['arc','Arco','Arc shot','Media vuelta alrededor.','Darle movimiento a un diálogo.','slow arc shot left around the subject','Arc Left'],
  ['bullet','Tiempo bala','Bullet time','Todo se congela mientras la cámara gira.','Acción, saltos, momentos «wow».','bullet time, frozen moment while the camera orbits','Bullet Time'],
  ['handheld','Cámara en mano','Handheld','Se mueve un poco, como si alguien la cargara.','Realismo, nervios, documental.','handheld camera, subtle natural shake','Handheld'],
  ['whip','Barrido','Whip pan','Giro tan rápido que se ve borroso.','Cambio de lugar con energía.','whip pan with motion blur, then settle','Whip Pan'],
  ['drone','Dron','Aerial / drone shot','Desde el aire, volando.','Ciudades, paisajes, inicio de la historia.','aerial drone shot flying over the restaurant','Aerial Pullback'],
  ['fpv','Dron FPV','FPV drone','Dron rápido que se mete entre cosas.','Energía, recorrer un lugar.','FPV drone shot weaving through the kitchen','FPV Drone'],
  ['snorri','Cámara pegada','Snorricam','La cámara va amarrada al cuerpo y el mundo se mueve.','Mareo, desesperación, prisa.','snorricam, camera rigged to the actor\'s body','Snorricam'],
  ['through','A través de','Through object','La cámara cruza una ventana, puerta o reja.','Entrar a un lugar con estilo.','camera moves through the window into the room','Through Object In'],
  ['reveal','Revelación','Reveal shot','La cámara sale de atrás de algo y descubre la escena.','Sorpresas.','reveal shot, camera moves past a pillar to reveal the subject','Crane Down'],
 ]},
 {id:'lens',name:'Lente y enfoque',desc:'Cómo se ve la imagen: amplia, apretada, con fondo borroso.',items:[
  ['wide','Gran angular','Wide-angle lens (16–24 mm)','Se ve mucho espacio; las cosas cerca se ven grandes.','Lugares chicos, energía.','shot on a 24mm wide-angle lens'],
  ['normal','Lente normal','Standard lens (35–50 mm)','Parecido a como ve el ojo.','Natural, cotidiano.','shot on a 50mm lens'],
  ['tele','Teleobjetivo','Telephoto lens (85–200 mm)','Acerca desde lejos y junta el fondo.','Retratos bonitos, espiar.','shot on an 85mm telephoto lens, compressed background'],
  ['fisheye','Ojo de pez','Fisheye lens','Imagen redonda y deformada.','Videos musicales, skate, humor.','fisheye lens distortion','Fisheye'],
  ['shallow','Fondo borroso','Shallow depth of field / bokeh','La persona nítida y el fondo desenfocado.','Que todo se fije en el personaje.','shallow depth of field, creamy bokeh background'],
  ['deep','Todo enfocado','Deep focus','Lo de cerca y lo de lejos se ve nítido.','Mostrar varias cosas a la vez.','deep focus, everything sharp from foreground to background'],
  ['rack','Cambio de foco','Rack focus','El foco pasa de una cosa a otra.','Llevar la mirada al detalle importante.','rack focus from the foreground to the background','Focus Change'],
  ['macro','Macro','Macro shot','Algo pequeñísimo se ve gigante.','Comida, gotas, texturas.','macro shot, extreme detail'],
  ['anamorphic','Anamórfico','Anamorphic lens','Pantalla muy ancha con destellos horizontales.','Look de película de cine.','anamorphic lens, horizontal lens flares, cinematic'],
 ]},
 {id:'composition',name:'Composición',desc:'Dónde va cada cosa dentro del cuadro.',items:[
  ['thirds','Regla de tercios','Rule of thirds','El cuadro en 9 partes; lo importante va en un cruce.','Imágenes equilibradas y naturales.','subject placed on the rule of thirds'],
  ['center','Centrado','Centered composition','La persona justo al centro.','Fuerza, orden, estilo Wes Anderson.','centered composition, subject in the middle'],
  ['sym','Simetría','Symmetrical framing','Lo de un lado es igual al otro.','Orden, perfección, tensión elegante.','perfectly symmetrical framing'],
  ['leading','Líneas guía','Leading lines','Calles, mesas o luces que llevan la vista a la persona.','Dirigir la mirada.','leading lines pointing to the subject'],
  ['framein','Marco dentro del cuadro','Frame within a frame','La persona vista dentro de una puerta o ventana.','Profundidad, encierro.','framed through a doorway, frame within a frame'],
  ['lookroom','Espacio de mirada','Lead room / nose room','Dejar espacio hacia donde mira la persona.','Que se vea natural, no apretado.','lead room in the direction of the gaze'],
 ]},
 {id:'light',name:'Luz',desc:'La luz cambia el sentimiento de la escena.',items:[
  ['natural','Luz natural','Natural light','Luz del sol o de la ventana.','Realista, cálido.','soft natural window light'],
  ['golden','Hora dorada','Golden hour','Sol bajito al atardecer o amanecer.','Nostalgia, belleza, final feliz.','golden hour sunlight, warm glow'],
  ['backlight','Contraluz','Backlight / silhouette','La luz viene de atrás de la persona.','Misterio, siluetas, entradas épicas.','strong backlight, silhouette'],
  ['threepoint','Luz de tres puntos','Three-point lighting','Principal + relleno + contraluz.','Comerciales y entrevistas limpias.','three-point lighting, studio quality'],
  ['highkey','Clave alta','High-key lighting','Todo claro, casi sin sombras.','Comerciales alegres, limpios.','high-key bright lighting, soft shadows'],
  ['lowkey','Clave baja','Low-key lighting','Mucha sombra y poca luz.','Suspenso, drama.','low-key lighting, deep shadows, chiaroscuro'],
  ['rembrandt','Rembrandt','Rembrandt lighting','Un triangulito de luz en la mejilla oscura.','Retratos dramáticos.','Rembrandt lighting on the face'],
  ['neon','Neón','Neon lighting','Luces de colores (rosa, azul).','Noche, ciudad, fiesta.','neon pink and cyan lighting at night'],
  ['practical','Luz práctica','Practical light','Lámparas o pantallas que salen en la toma.','Realismo en interiores.','practical lights, warm lamps in frame'],
 ]},
 {id:'time',name:'Tiempo y velocidad',desc:'Cómo corre el tiempo dentro de la toma.',items:[
  ['slowmo','Cámara lenta','Slow motion','Todo va más despacio.','Momentos importantes, comida que cae.','slow motion, 120 fps'],
  ['ramp','Cambio de velocidad','Speed ramp','Normal → lento → normal en la misma toma.','Acción con estilo.','speed ramp, slows down at the key moment'],
  ['timelapse','Timelapse','Time-lapse','Horas en pocos segundos.','Pasa el día, la gente va y viene.','time-lapse of the restaurant from morning to night','Timelapse Human'],
  ['hyperlapse','Hyperlapse','Hyperlapse','Timelapse mientras la cámara avanza.','Recorrer una ciudad.','hyperlapse moving through the street','Hyperlapse'],
  ['freeze','Congelado','Freeze frame','La imagen se detiene.','Presentar un personaje, chiste.','freeze frame at the peak moment'],
  ['oner','Plano secuencia','Long take / oner','Todo en una sola toma sin cortes.','Meter al público en la acción.','one continuous long take, no cuts'],
 ]},
 {id:'transition',name:'Transiciones',desc:'Cómo se une una escena con la siguiente.',items:[
  ['cut','Corte','Cut','Cambia directo a la otra toma.','Lo normal, el ritmo.','hard cut'],
  ['fade','Fundido a negro','Fade to black','La imagen se oscurece hasta negro.','Final o paso de tiempo.','fade to black'],
  ['dissolve','Encadenado','Cross dissolve','Una imagen se mezcla con la otra.','Recuerdos, paso del tiempo.','cross dissolve'],
  ['match','Corte por coincidencia','Match cut','Una forma se parece a la siguiente (plato → luna).','Ingenio, conectar ideas.','match cut from the plate to the full moon'],
  ['whipt','Transición barrida','Whip transition','Barrido rápido que entra a otra escena.','Energía, comerciales.','whip pan transition to the next scene','Flying Cam Transition'],
 ]},
]
