--
-- PostgreSQL database dump
--

\restrict YHpJ74df28HYaaAIQ3sayiqCsOyYg7SjFg0ZGfkULdB1dZ4HhzillAP9QqsqRHY

-- Dumped from database version 16.10
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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: high_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.high_scores (
    id integer NOT NULL,
    name text NOT NULL,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.high_scores OWNER TO postgres;

--
-- Name: high_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.high_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.high_scores_id_seq OWNER TO postgres;

--
-- Name: high_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.high_scores_id_seq OWNED BY public.high_scores.id;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    request_count integer NOT NULL,
    expires_at bigint NOT NULL
);


ALTER TABLE public.rate_limits OWNER TO postgres;

--
-- Name: high_scores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.high_scores ALTER COLUMN id SET DEFAULT nextval('public.high_scores_id_seq'::regclass);


--
-- Data for Name: high_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.high_scores (id, name, score, created_at) FROM stdin;
1	DIEGO	215	2026-09-16 19:18:26+00
54	DIMOFARU	155	2026-09-18 17:42:23.802922+00
55	OTROMAS	460	2026-09-19 12:46:49.50197+00
56	NUEVO	100	2026-09-19 12:47:22.805523+00
57	LIDER	1825	2026-09-19 12:53:44.112349+00
\.


--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rate_limits (key, request_count, expires_at) FROM stdin;
score:127.0.0.1	1	1789822484075
\.


--
-- Name: high_scores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.high_scores_id_seq', 57, true);


--
-- Name: high_scores high_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.high_scores
    ADD CONSTRAINT high_scores_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: high_scores_ranking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX high_scores_ranking ON public.high_scores USING btree (score, created_at, id);


--
-- Name: rate_limits_expiration; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rate_limits_expiration ON public.rate_limits USING btree (expires_at);


--
-- PostgreSQL database dump complete
--

\unrestrict YHpJ74df28HYaaAIQ3sayiqCsOyYg7SjFg0ZGfkULdB1dZ4HhzillAP9QqsqRHY

