alter table announcements add column if not exists promo_id uuid references promotions(id) on delete cascade;
