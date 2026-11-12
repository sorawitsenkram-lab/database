-- =====================================================================
-- สมุดบันทึกเคสประจำวัน : ฐานข้อมูล (Supabase / PostgreSQL)
-- วิธีใช้: Supabase > SQL Editor > New query > วางทั้งไฟล์นี้ > Run
-- ★ แก้รหัสทีมและ PIN หลังบ้านในบรรทัด insert into settings ด้านล่างก่อนกด Run
-- =====================================================================

-- ---------- ตาราง ----------
create table if not exists settings (
  key   text primary key,
  value text not null
);
insert into settings (key, value) values
  ('team_key',  'change-me-team'),   -- ★ รหัสทีม: ทุกคนใส่ครั้งแรกที่เปิดเว็บ
  ('admin_pin', '1234')              -- ★ PIN หลังบ้าน: ใช้เพิ่ม/ลบรายชื่อ
on conflict (key) do nothing;

create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists cases (
  id         uuid primary key default gen_random_uuid(),
  case_no    text not null default '',
  title      text not null,
  detail     text not null default '',
  case_date  date not null default current_date,
  status     text not null default 'กำลังดำเนินการ',
  owner      uuid references staff(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists logs (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references cases(id) on delete cascade,
  body       text not null,
  by_id      uuid,
  by_name    text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists logs_case_idx  on logs(case_id);
create index if not exists cases_date_idx on cases(case_date desc);

-- ---------- ล็อกตาราง: เข้าถึงได้เฉพาะผ่านฟังก์ชันด้านล่างที่ตรวจรหัสทีมแล้วเท่านั้น ----------
alter table settings enable row level security;
alter table staff    enable row level security;
alter table cases    enable row level security;
alter table logs     enable row level security;
revoke all on settings, staff, cases, logs from anon, authenticated;

-- ---------- ฟังก์ชันภายใน ----------
create or replace function _need_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key is distinct from (select value from settings where key = 'team_key') then
    raise exception 'รหัสทีมไม่ถูกต้อง';
  end if;
end $$;

create or replace function _need_pin(p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from settings where key = 'admin_pin') then
    raise exception 'PIN ไม่ถูกต้อง';
  end if;
end $$;

revoke execute on function _need_key(text), _need_pin(text) from public, anon, authenticated;

-- ---------- API ที่หน้าเว็บเรียกใช้ ----------
create or replace function get_all(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  return jsonb_build_object(
    'staff', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'at', (extract(epoch from created_at) * 1000)::bigint
      ) order by created_at), '[]'::jsonb) from staff),
    'cases', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'caseNo', case_no, 'title', title, 'detail', detail,
        'date', to_char(case_date, 'YYYY-MM-DD'), 'status', status, 'owner', owner,
        'createdAt', (extract(epoch from created_at) * 1000)::bigint
      )), '[]'::jsonb) from cases),
    'logs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'caseId', case_id, 'text', body, 'by', by_id, 'byName', by_name,
        'at', (extract(epoch from created_at) * 1000)::bigint
      ) order by created_at), '[]'::jsonb) from logs)
  );
end $$;

create or replace function check_pin(p_key text, p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  return p_pin is not distinct from (select value from settings where key = 'admin_pin');
end $$;

create or replace function add_case(p_key text, p_data jsonb, p_by uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform _need_key(p_key);
  insert into cases (case_no, title, detail, case_date, status, owner, created_by)
  values (
    coalesce(p_data->>'caseNo', ''),
    p_data->>'title',
    coalesce(p_data->>'detail', ''),
    coalesce(nullif(p_data->>'date', '')::date, current_date),
    coalesce(nullif(p_data->>'status', ''), 'กำลังดำเนินการ'),
    nullif(p_data->>'owner', '')::uuid,
    p_by
  ) returning id into v;
  return v;
end $$;

create or replace function update_case(p_key text, p_id uuid, p_data jsonb, p_by uuid, p_by_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o uuid; s text; note text;
  n_owner uuid := nullif(p_data->>'owner', '')::uuid;
  n_status text := coalesce(nullif(p_data->>'status', ''), 'กำลังดำเนินการ');
begin
  perform _need_key(p_key);
  select owner, status into o, s from cases where id = p_id;
  if not found then raise exception 'ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)'; end if;

  update cases set
    case_no   = coalesce(p_data->>'caseNo', ''),
    title     = p_data->>'title',
    detail    = coalesce(p_data->>'detail', ''),
    case_date = coalesce(nullif(p_data->>'date', '')::date, current_date),
    status    = n_status,
    owner     = n_owner
  where id = p_id;

  if o is distinct from n_owner then
    note := 'ส่งต่อเคสจาก ' || coalesce((select name from staff where id = o), '(ไม่ระบุ)')
         || ' ไปยัง '       || coalesce((select name from staff where id = n_owner), '(ไม่ระบุ)');
  elsif s is distinct from n_status then
    note := 'เปลี่ยนสถานะเป็น ' || n_status;
  end if;
  if note is not null then
    insert into logs (case_id, body, by_id, by_name)
    values (p_id, note, p_by, coalesce(p_by_name, 'ไม่ระบุชื่อ'));
  end if;
end $$;

create or replace function add_log(p_key text, p_case uuid, p_body text, p_by uuid, p_by_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  if not exists (select 1 from cases where id = p_case) then
    raise exception 'ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)';
  end if;
  insert into logs (case_id, body, by_id, by_name)
  values (p_case, p_body, p_by, coalesce(p_by_name, 'ไม่ระบุชื่อ'));
end $$;

create or replace function delete_case(p_key text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  delete from cases where id = p_id;   -- ประวัติอัพเดทถูกลบตามอัตโนมัติ
end $$;

create or replace function add_staff(p_key text, p_pin text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  perform _need_pin(p_pin);
  insert into staff (name) values (trim(p_name));
end $$;

create or replace function remove_staff(p_key text, p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_key(p_key);
  perform _need_pin(p_pin);
  delete from staff where id = p_id;
end $$;
