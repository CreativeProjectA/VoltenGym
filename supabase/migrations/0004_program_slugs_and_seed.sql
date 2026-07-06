-- Volten Gym — vincula los programas hardcodeados del diseño con datos reales
-- y siembra 2 programas de ejemplo (Fuerza Total, Movilidad Pro) con ejercicios.

alter table programs add column if not exists slug text unique;

-- Categorías base
insert into categories (name, icon) values
  ('Fuerza', 'dumbbell'),
  ('Cardio', 'heart'),
  ('HIIT', 'flame'),
  ('Movilidad', 'stretch')
on conflict do nothing;

-- Programa 1: Fuerza Total (coach_id null = lo creó/lo ofrece el gym, no un coach específico)
insert into programs (slug, title, description, level, duration_weeks)
values ('fuerza', 'Fuerza Total', 'Programa de fuerza e hipertrofia, 5 días por semana.', 'Intermedio', 8)
on conflict (slug) do nothing;

insert into program_exercises (program_id, order_index, name, sets, reps, notes)
select p.id, v.order_index, v.name, v.sets, v.reps, v.notes
from programs p, (values
  (1, 'Press de Banca con Barra', 4, '8', 'Pecho principal · Tríceps'),
  (2, 'Press Inclinado Mancuernas', 3, '10', 'Pecho superior · Hombro'),
  (3, 'Fondos en Paralelas', 3, '12', 'Pecho inferior · Tríceps'),
  (4, 'Press Francés Barra EZ', 4, '10', 'Tríceps largo · Cabeza lateral'),
  (5, 'Extensiones Tríceps Polea', 3, '15', 'Tríceps · Aislamiento'),
  (6, 'Flexiones Diamante', 3, 'fallo', 'Tríceps · Peso corporal')
) as v(order_index, name, sets, reps, notes)
where p.slug = 'fuerza'
  and not exists (select 1 from program_exercises pe where pe.program_id = p.id);

-- Programa 2: Movilidad Pro
insert into programs (slug, title, description, level, duration_weeks)
values ('movilidad', 'Movilidad Pro', 'Movilidad de cadera y hombro, 3 días por semana.', 'Principiante', 6)
on conflict (slug) do nothing;

insert into program_exercises (program_id, order_index, name, sets, reps, notes)
select p.id, v.order_index, v.name, v.sets, v.reps, v.notes
from programs p, (values
  (1, 'Rotaciones de Cadera 90/90', 3, '8', 'Cadera · Movilidad'),
  (2, 'Estiramiento de Cadera en Zancada', 3, '30s', 'Cadera · Flexores'),
  (3, 'Movilidad de Tobillo en Pared', 3, '10', 'Tobillo · Rango de movimiento'),
  (4, 'Rotación de Hombro con Banda', 3, '12', 'Hombro · Manguito rotador'),
  (5, 'Gato-Camello', 3, '10', 'Columna · Movilidad')
) as v(order_index, name, sets, reps, notes)
where p.slug = 'movilidad'
  and not exists (select 1 from program_exercises pe where pe.program_id = p.id);
