-- Agrega horario preferido de entrenamiento, peso y altura al perfil del miembro.
alter table member_profiles
  add column if not exists preferred_hours text,  -- 'morning' | 'afternoon' | 'evening' | 'flexible'
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric;
