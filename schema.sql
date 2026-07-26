-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username character varying NOT NULL,
  email character varying NOT NULL,
  telefono character varying,
  email_verified_at timestamp without time zone,
  password character varying NOT NULL,
  remember_token character varying,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  role integer,
  estado text,
  regions integer,
  nombre text,
  intentos_fallidos integer NOT NULL DEFAULT 0,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_role_fkey FOREIGN KEY (role) REFERENCES public.roles(id_rol),
  CONSTRAINT users_regions_fkey FOREIGN KEY (regions) REFERENCES public.regions(id_region)
);
CREATE TABLE public.roles (
  id_rol integer NOT NULL DEFAULT nextval('roles_id_seq'::regclass),
  name character varying NOT NULL,
  guard_name character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id_rol)
);
CREATE TABLE public.permissions (
  id integer NOT NULL DEFAULT nextval('permissions_id_seq'::regclass),
  name character varying NOT NULL,
  guard_name character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.role_has_permissions (
  role_id integer NOT NULL,
  permissions_id integer NOT NULL,
  CONSTRAINT role_has_permissions_pkey PRIMARY KEY (role_id, permissions_id),
  CONSTRAINT role_has_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id_rol),
  CONSTRAINT role_has_permissions_permissions_id_fkey FOREIGN KEY (permissions_id) REFERENCES public.permissions(id)
);
CREATE TABLE public.model_has_permissions (
  permissions_id integer NOT NULL,
  model_id integer NOT NULL,
  model_type character varying NOT NULL,
  CONSTRAINT model_has_permissions_pkey PRIMARY KEY (permissions_id, model_id, model_type),
  CONSTRAINT model_has_permissions_permissions_id_fkey FOREIGN KEY (permissions_id) REFERENCES public.permissions(id)
);
CREATE TABLE public.password_reset_tokens (
  email character varying NOT NULL,
  token character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (email)
);
CREATE TABLE public.units (
  id integer NOT NULL DEFAULT nextval('units_id_seq'::regclass),
  description character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT units_pkey PRIMARY KEY (id)
);
CREATE TABLE public.general_managements (
  id_gerencia_gral integer NOT NULL DEFAULT nextval('general_managements_id_seq'::regclass),
  unit_id integer,
  description character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT general_managements_pkey PRIMARY KEY (id_gerencia_gral),
  CONSTRAINT general_managements_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.line_managements (
  id_gerencia_linea integer NOT NULL DEFAULT nextval('line_managements_id_seq'::regclass),
  general_managements_id integer,
  description character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT line_managements_pkey PRIMARY KEY (id_gerencia_linea),
  CONSTRAINT line_managements_general_managements_id_fkey FOREIGN KEY (general_managements_id) REFERENCES public.general_managements(id_gerencia_gral)
);
CREATE TABLE public.positions (
  id_posicion integer NOT NULL DEFAULT nextval('positions_id_seq'::regclass),
  description character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT positions_pkey PRIMARY KEY (id_posicion)
);
CREATE TABLE public.regions (
  id_region integer NOT NULL DEFAULT nextval('regions_id_seq'::regclass),
  description character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT regions_pkey PRIMARY KEY (id_region)
);
CREATE TABLE public.personas (
  id_persona integer NOT NULL DEFAULT nextval('personas_id_seq'::regclass),
  cedulas character varying NOT NULL UNIQUE,
  nacionalidad character varying,
  nombres character varying NOT NULL,
  apellidos character varying NOT NULL,
  tipos character varying,
  estatus character varying,
  coordenadas character varying,
  position_id integer,
  region_id integer,
  unit_id integer,
  general_management_id integer,
  line_management_id integer,
  created_at timestamp without time zone DEFAULT now(),
  update_at timestamp without time zone DEFAULT now(),
  p00 text UNIQUE,
  CONSTRAINT personas_pkey PRIMARY KEY (id_persona),
  CONSTRAINT personas_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id_posicion),
  CONSTRAINT personas_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id_region),
  CONSTRAINT personas_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT personas_general_management_id_fkey FOREIGN KEY (general_management_id) REFERENCES public.general_managements(id_gerencia_gral),
  CONSTRAINT personas_line_management_id_fkey FOREIGN KEY (line_management_id) REFERENCES public.line_managements(id_gerencia_linea)
);
CREATE TABLE public.documents (
  id_documento integer NOT NULL DEFAULT nextval('documents_id_seq'::regclass),
  persona_id integer,
  ruta character varying NOT NULL,
  tipo_documento character varying,
  nombre_original character varying,
  hash_name character varying,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id_documento),
  CONSTRAINT documents_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id_persona)
);
CREATE TABLE public.estudios (
  id_estudio integer NOT NULL DEFAULT nextval('estudios_id_seq'::regclass),
  persona_id integer,
  titulo character varying NOT NULL,
  institucion character varying,
  estado_estudio character varying,
  soporte_path text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT estudios_pkey PRIMARY KEY (id_estudio),
  CONSTRAINT estudios_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id_persona)
);
CREATE TABLE public.referencias_laborales (
  id_referencia integer NOT NULL DEFAULT nextval('referencias_laborales_id_seq'::regclass),
  persona_id integer,
  referencia_contacto character varying,
  telefono_contacto character varying,
  fecha_inicio date,
  fecha_fin date,
  salario numeric,
  motivo_egreso character varying,
  soporte_path text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT referencias_laborales_pkey PRIMARY KEY (id_referencia),
  CONSTRAINT referencias_laborales_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id_persona)
);
CREATE TABLE public.solicitudes_especialistas (
  id_solicitud integer NOT NULL DEFAULT nextval('solicitudes_especialistas_id_seq'::regclass),
  solicitante_id integer,
  tipo_solicitud character varying,
  estatus character varying,
  detalle text,
  criticidad character varying,
  documento_1 text,
  documento_2 text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT solicitudes_especialistas_pkey PRIMARY KEY (id_solicitud),
  CONSTRAINT solicitudes_especialistas_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES public.users(id)
);
CREATE TABLE public.investigaciones (
  id_investigacion integer NOT NULL DEFAULT nextval('investigaciones_id_seq'::regclass),
  numero_ticket integer,
  denunciante_id integer,
  descripcion_hechos text,
  fecha_incidente date,
  estatus character varying,
  conclusion text,
  soporte_path text,
  coordinador_asignado integer,
  supervisor_asignado integer,
  especialista_asignado integer,
  plan_trabajo text,
  fecha_limite date,
  sustanciacion_detalle text,
  sustanciacion_doc1 text,
  sustanciacion_doc2 text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT investigaciones_pkey PRIMARY KEY (id_investigacion),
  CONSTRAINT investigaciones_numero_ticket_fkey FOREIGN KEY (numero_ticket) REFERENCES public.solicitudes_especialistas(id_solicitud),
  CONSTRAINT investigaciones_denunciante_id_fkey FOREIGN KEY (denunciante_id) REFERENCES public.users(id),
  CONSTRAINT investigaciones_coordinador_asignado_fkey FOREIGN KEY (coordinador_asignado) REFERENCES public.users(id),
  CONSTRAINT investigaciones_supervisor_asignado_fkey FOREIGN KEY (supervisor_asignado) REFERENCES public.users(id),
  CONSTRAINT investigaciones_especialista_asignado_fkey FOREIGN KEY (especialista_asignado) REFERENCES public.users(id)
);
CREATE TABLE public.investigacion_persona (
  investigacion_id integer NOT NULL,
  persona_id integer NOT NULL,
  grado_implicacion character varying,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT investigacion_persona_pkey PRIMARY KEY (investigacion_id, persona_id),
  CONSTRAINT investigacion_persona_investigacion_id_fkey FOREIGN KEY (investigacion_id) REFERENCES public.investigaciones(id_investigacion),
  CONSTRAINT investigacion_persona_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id_persona)
);
CREATE TABLE public.casos_estado_historial (
  id_movimiento integer NOT NULL DEFAULT nextval('casos_estado_historial_id_seq'::regclass),
  investigacion_id integer,
  estado_anterior character varying NOT NULL,
  estado_nuevo character varying NOT NULL,
  fecha_cambio timestamp without time zone DEFAULT now(),
  usuario_id integer,
  CONSTRAINT casos_estado_historial_pkey PRIMARY KEY (id_movimiento),
  CONSTRAINT casos_estado_historial_investigacion_id_fkey FOREIGN KEY (investigacion_id) REFERENCES public.investigaciones(id_investigacion),
  CONSTRAINT casos_estado_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.casos_comentarios (
  id_comentario integer NOT NULL DEFAULT nextval('casos_comentarios_id_seq'::regclass),
  investigacion_id integer,
  autor_id integer,
  texto text NOT NULL,
  fecha timestamp without time zone DEFAULT now(),
  CONSTRAINT casos_comentarios_pkey PRIMARY KEY (id_comentario),
  CONSTRAINT casos_comentarios_investigacion_id_fkey FOREIGN KEY (investigacion_id) REFERENCES public.investigaciones(id_investigacion),
  CONSTRAINT casos_comentarios_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.users(id)
);
CREATE TABLE public.notificaciones (
  id_notificacion bigint NOT NULL DEFAULT nextval('notificaciones_id_seq'::regclass),
  user_id text NOT NULL,
  mensaje text NOT NULL,
  link jsonb,
  leido boolean NOT NULL DEFAULT false,
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_pkey PRIMARY KEY (id_notificacion)
);
