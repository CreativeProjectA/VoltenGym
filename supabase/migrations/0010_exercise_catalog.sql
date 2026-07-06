-- Catálogo de ejercicios del gym, editables por coaches y admins.
create table exercise_catalog (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null, -- 'fuerza' | 'cardio' | 'movilidad' | 'bienestar'
  muscle_groups text,
  equipment     text,
  description   text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table exercise_catalog enable row level security;
create policy "exercise_catalog_read_auth" on exercise_catalog for select using (auth.role() = 'authenticated');
create policy "exercise_catalog_write_admin_coach" on exercise_catalog
  for all using (current_role_is('admin') or current_role_is('coach'))
  with check (current_role_is('admin') or current_role_is('coach'));

-- ── FUERZA ────────────────────────────────────────────────────────
insert into exercise_catalog (name, category, muscle_groups, equipment) values
  ('Press de Banca con Barra',      'fuerza', 'Pecho · Tríceps',          'Barra / Banco'),
  ('Sentadilla con Barra',          'fuerza', 'Cuádriceps · Glúteos',     'Barra / Rack'),
  ('Peso Muerto',                   'fuerza', 'Espalda baja · Piernas',   'Barra'),
  ('Remo con Barra',                'fuerza', 'Espalda · Bíceps',         'Barra'),
  ('Press Militar de Pie',          'fuerza', 'Hombros · Tríceps',        'Barra'),
  ('Dominadas',                     'fuerza', 'Espalda · Bíceps',         'Barra de dominadas'),
  ('Curl de Bíceps con Mancuernas', 'fuerza', 'Bíceps',                   'Mancuernas'),
  ('Extensiones de Tríceps Polea',  'fuerza', 'Tríceps',                  'Polea alta'),
  ('Press Inclinado con Mancuernas','fuerza', 'Pecho superior · Hombro',  'Mancuernas / Banco inclinado'),
  ('Leg Press',                     'fuerza', 'Cuádriceps · Glúteos',     'Máquina Leg Press'),
  ('Hip Thrust con Barra',          'fuerza', 'Glúteos · Isquiotibiales', 'Barra / Banco'),
  ('Remo en Máquina',               'fuerza', 'Espalda media',            'Máquina de remo'),
  ('Fondos en Paralelas',           'fuerza', 'Pecho · Tríceps',          'Paralelas');

-- ── CARDIO ────────────────────────────────────────────────────────
insert into exercise_catalog (name, category, muscle_groups, equipment) values
  ('Caminata Rápida',              'cardio', 'Glúteos · Cardio',         'Caminadora'),
  ('Trote Continuo',               'cardio', 'Piernas · Cardio',         'Caminadora'),
  ('Sprints de 30 segundos',       'cardio', 'Piernas · Cardio',         'Caminadora'),
  ('Bicicleta Estacionaria',       'cardio', 'Piernas · Cardio',         'Bicicleta estacionaria'),
  ('Elíptica',                     'cardio', 'Full body · Cardio',       'Elíptica'),
  ('Escaladora',                   'cardio', 'Glúteos · Piernas',        'Escaladora (StairMaster)'),
  ('Saltar la Cuerda',             'cardio', 'Full body · Cardio',       'Cuerda de saltar'),
  ('Remo en Máquina (cardio)',     'cardio', 'Espalda · Cardio',         'Remo ergómetro'),
  ('Intervalos de Alta Intensidad','cardio', 'Full body · Cardio',       'Caminadora / Área libre'),
  ('Jumping Jacks',                'cardio', 'Full body · Cardio',       'Sin equipo');

-- ── MOVILIDAD ─────────────────────────────────────────────────────
insert into exercise_catalog (name, category, muscle_groups, equipment) values
  ('Rotaciones de Cadera 90/90',         'movilidad', 'Cadera',               'Sin equipo'),
  ('Cat-Cow (Gato-Camello)',             'movilidad', 'Columna',              'Colchoneta'),
  ('Estiramiento de Isquiotibiales',     'movilidad', 'Isquiotibiales',       'Sin equipo / Colchoneta'),
  ('Hip Flexor Lunge Stretch',           'movilidad', 'Flexores de cadera',   'Sin equipo'),
  ('Movilidad Torácica con Foam Roller', 'movilidad', 'Columna torácica',     'Foam Roller'),
  ('Rotación de Hombro con Banda',       'movilidad', 'Hombro',               'Banda elástica'),
  ('Movilidad de Tobillo en Pared',      'movilidad', 'Tobillo',              'Pared'),
  ('Apertura de Cadera en Cuclillas',    'movilidad', 'Cadera · Inglés',      'Sin equipo'),
  ('Estiramiento de Cuádriceps',         'movilidad', 'Cuádriceps',           'Sin equipo'),
  ('Thread the Needle (hombro/dorsal)',  'movilidad', 'Hombro · Dorsal',      'Colchoneta');

-- ── BIENESTAR ─────────────────────────────────────────────────────
insert into exercise_catalog (name, category, muscle_groups, equipment) values
  ('Respiración Diafragmática',          'bienestar', 'Mente · Abdomen',      'Sin equipo'),
  ('Saludo al Sol (Yoga)',               'bienestar', 'Full body',            'Colchoneta'),
  ('Foam Roller Espalda',                'bienestar', 'Espalda',              'Foam Roller'),
  ('Estiramiento de Cuello y Trapecio',  'bienestar', 'Cuello · Trapecios',   'Sin equipo'),
  ('Caminata Relajante 20 min',          'bienestar', 'Piernas · Cardio bajo','Caminadora / Aire libre'),
  ('Estiramiento de Pecho en Marco',     'bienestar', 'Pecho · Hombros',      'Marco de puerta'),
  ('Meditación Guiada 5 min',            'bienestar', 'Mente',                'Sin equipo'),
  ('Estiramiento de Espalda Baja',       'bienestar', 'Espalda baja',         'Colchoneta'),
  ('Roll de Cuello',                     'bienestar', 'Cuello',               'Sin equipo'),
  ('Estiramiento de Pantorrillas',       'bienestar', 'Pantorrillas',         'Escalón / Pared');
