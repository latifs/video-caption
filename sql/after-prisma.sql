create or replace function public.create_user_on_sign_up()
    returns trigger as $$
    begin
    insert into public."User"(id, email, "displayName", "imageUrl")
    values(
        new.id,
        new.raw_user_meta_data ->> 'email',
        COALESCE(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'name'),
        new.raw_user_meta_data ->> 'avatar_url'
    );
    return new;
    end;
    $$ language plpgsql security definer;

create or replace function public.update_user_on_sign_up()
    returns trigger as $$
    begin
    update public."User"
    set email = new.raw_user_meta_data ->> 'email',
        "displayName" = COALESCE(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'name'),
        "imageUrl" = new.raw_user_meta_data ->> 'avatar_url'
    where id = (new.id)::uuid;
    return new;
    end;
    $$ language plpgsql security definer;


drop trigger if exists create_user_on_sign_up on auth.users;
drop trigger if exists update_user_on_sign_up on auth.users;

create trigger create_user_on_sign_up after insert on auth.users for each row execute function create_user_on_sign_up();
create trigger update_user_on_sign_up after update on auth.users for each row execute function update_user_on_sign_up();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ BEGIN
  CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = 'raw');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'videos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;