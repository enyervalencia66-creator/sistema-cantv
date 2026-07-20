CREATE TABLE notificaciones (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  link JSONB,
  leido BOOLEAN NOT NULL DEFAULT false,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_user_id ON notificaciones(user_id);
