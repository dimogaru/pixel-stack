--
-- PostgreSQL database dump
--

\restrict 7NnIYvqMJqeHmSWk9EAqnq0jQSszaboK9KlRFzKFqP3Ey5O94qnxLLxc7LRnq60

-- Dumped from database version 16.15 (eb11870)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP INDEX public.rate_limits_expiration;
DROP INDEX public.high_scores_ranking;
DROP INDEX _system.idx_replit_database_migrations_v1_build_id;
ALTER TABLE ONLY public.rate_limits DROP CONSTRAINT rate_limits_pkey;
ALTER TABLE ONLY public.high_scores DROP CONSTRAINT high_scores_pkey;
ALTER TABLE ONLY _system.replit_database_migrations_v1 DROP CONSTRAINT replit_database_migrations_v1_pkey;
ALTER TABLE public.high_scores ALTER COLUMN id DROP DEFAULT;
ALTER TABLE _system.replit_database_migrations_v1 ALTER COLUMN id DROP DEFAULT;
DROP TABLE public.rate_limits;
DROP SEQUENCE public.high_scores_id_seq;
DROP TABLE public.high_scores;
DROP SEQUENCE _system.replit_database_migrations_v1_id_seq;
DROP TABLE _system.replit_database_migrations_v1;
DROP SCHEMA _system;
--
-- Name: _system; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _system;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: replit_database_migrations_v1; Type: TABLE; Schema: _system; Owner: -
--

CREATE TABLE _system.replit_database_migrations_v1 (
    id bigint NOT NULL,
    build_id text NOT NULL,
    deployment_id text NOT NULL,
    statement_count bigint NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE; Schema: _system; Owner: -
--

CREATE SEQUENCE _system.replit_database_migrations_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: _system; Owner: -
--

ALTER SEQUENCE _system.replit_database_migrations_v1_id_seq OWNED BY _system.replit_database_migrations_v1.id;


--
-- Name: high_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.high_scores (
    id integer NOT NULL,
    name text NOT NULL,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: high_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.high_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: high_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.high_scores_id_seq OWNED BY public.high_scores.id;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    request_count integer NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: replit_database_migrations_v1 id; Type: DEFAULT; Schema: _system; Owner: -
--

ALTER TABLE ONLY _system.replit_database_migrations_v1 ALTER COLUMN id SET DEFAULT nextval('_system.replit_database_migrations_v1_id_seq'::regclass);


--
-- Name: high_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.high_scores ALTER COLUMN id SET DEFAULT nextval('public.high_scores_id_seq'::regclass);


--
-- Data for Name: replit_database_migrations_v1; Type: TABLE DATA; Schema: _system; Owner: -
--

COPY _system.replit_database_migrations_v1 (id, build_id, deployment_id, statement_count, applied_at) FROM stdin;
1	fd38c37c-5481-47c9-b607-06acbf83d137	2a4b0291-3cc6-4c65-aff3-c66d781e7d1e	2	2026-09-14 16:45:53.890107+00
2	c1e7883f-5223-4571-adae-237b59f994ca	2a4b0291-3cc6-4c65-aff3-c66d781e7d1e	2	2026-09-18 07:26:50.968277+00
\.


--
-- Data for Name: high_scores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.high_scores (id, name, score, created_at) FROM stdin;
35	MACHINBEST	7100	2026-09-18 16:51:17.705416+00
38	ROOTRETURN	9130	2026-09-18 18:13:07.148946+00
43	DIEGO	5880	2026-09-18 19:03:02.600849+00
45	CATURLA	6380	2026-09-18 21:04:33.88812+00
46	MARA	6870	2026-09-18 21:15:50.105367+00
54	MACHIN	8895	2026-09-18 23:47:14.178818+00
55	MACHIN	7530	2026-09-18 23:55:00.96722+00
58	LUCHII	5715	2026-09-19 12:02:05.099954+00
59	ABALOS	7990	2026-09-19 15:26:28.074085+00
60	MACHINBOT	14880	2026-09-19 15:40:42.392834+00
61	MOISEX	10325	2026-09-19 15:49:06.722425+00
62	SUDO	8405	2026-09-19 16:08:39.424325+00
63	ALOSA	8415	2026-09-19 16:09:38.329319+00
64	MOISEX	11080	2026-09-19 16:33:44.940984+00
65	MOISEX	16265	2026-09-19 18:51:43.456748+00
67	ELRUSO	8225	2026-09-19 22:05:38.689972+00
68	PALOMA	5880	2026-09-20 07:24:35.758174+00
69	CARACTURLA	7550	2026-09-20 12:41:17.901078+00
\.


--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rate_limits (key, request_count, expires_at) FROM stdin;
score:207.175.19.43	1	1789908137768
\.


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE SET; Schema: _system; Owner: -
--

SELECT pg_catalog.setval('_system.replit_database_migrations_v1_id_seq', 2, true);


--
-- Name: high_scores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.high_scores_id_seq', 69, true);


--
-- Name: replit_database_migrations_v1 replit_database_migrations_v1_pkey; Type: CONSTRAINT; Schema: _system; Owner: -
--

ALTER TABLE ONLY _system.replit_database_migrations_v1
    ADD CONSTRAINT replit_database_migrations_v1_pkey PRIMARY KEY (id);


--
-- Name: high_scores high_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.high_scores
    ADD CONSTRAINT high_scores_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: idx_replit_database_migrations_v1_build_id; Type: INDEX; Schema: _system; Owner: -
--

CREATE UNIQUE INDEX idx_replit_database_migrations_v1_build_id ON _system.replit_database_migrations_v1 USING btree (build_id);


--
-- Name: high_scores_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX high_scores_ranking ON public.high_scores USING btree (score, created_at, id);


--
-- Name: rate_limits_expiration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_expiration ON public.rate_limits USING btree (expires_at);


--
-- PostgreSQL database dump complete
--

\unrestrict 7NnIYvqMJqeHmSWk9EAqnq0jQSszaboK9KlRFzKFqP3Ey5O94qnxLLxc7LRnq60

