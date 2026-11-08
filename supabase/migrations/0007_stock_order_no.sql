-- Order number for manually managed stock (printed in the QR label together with the seller).
alter table public.stock_items add column if not exists order_no text;
