"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { criarClienteNavegador } from "@/utils/supabase/client";

// Mantém uma tela em dia com o servidor:
// 1. ouve o canal do evento no Supabase Realtime (o aviso não traz dado, só acorda a tela);
// 2. a cada aviso, consulta o servidor e redesenha;
// 3. rede de segurança: consulta a cada 15 s, ao voltar a ficar visível e ao voltar a rede.
// Avisos de "resposta" são atendidos no máximo uma vez por segundo.

const INTERVALO_MS = 15_000;
const INTERVALO_MINIMO_RESPOSTAS_MS = 1_000;

type Opcoes = {
  // Reage a avisos de "resposta" (controle e telão). O celular ignora.
  ouvirRespostas?: boolean;
  // Chamado quando o servidor responde 401 (sessão acabou).
  aoPerderSessao?: () => void;
  // Chamado quando o servidor responde 404 (ex.: evento apagado com o telão aberto).
  aoNaoEncontrar?: () => void;
};

export function useEstadoAoVivo<T>(url: string, eventoId: string, inicial: T, opcoes: Opcoes = {}) {
  const [dados, setDados] = useState<T>(inicial);
  const [semConexao, setSemConexao] = useState(false);

  const opcoesRef = useRef(opcoes);
  useEffect(() => {
    opcoesRef.current = opcoes;
  });

  const recarregarRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let ativo = true;
    let emAndamento = false;
    let pendente = false;
    let ultimaConsulta = 0;
    let agendada: ReturnType<typeof setTimeout> | null = null;

    async function consultar(): Promise<void> {
      if (emAndamento) {
        pendente = true; // consulta de novo assim que esta terminar
        return;
      }
      emAndamento = true;
      ultimaConsulta = Date.now();
      try {
        const resposta = await fetch(url, { cache: "no-store" });
        if (!ativo) return;
        if (resposta.status === 401) {
          opcoesRef.current.aoPerderSessao?.();
          return;
        }
        if (resposta.status === 404) {
          opcoesRef.current.aoNaoEncontrar?.();
          return;
        }
        if (!resposta.ok) throw new Error(String(resposta.status));
        const novo = (await resposta.json()) as T;
        if (!ativo) return;
        setDados(novo);
        setSemConexao(false);
      } catch {
        if (ativo) setSemConexao(true);
      } finally {
        emAndamento = false;
        if (pendente && ativo) {
          pendente = false;
          void consultar();
        }
      }
    }

    // Para avisos de resposta: no máximo uma consulta por segundo.
    function consultarSemPressa() {
      if (agendada) return;
      const espera = Math.max(0, ultimaConsulta + INTERVALO_MINIMO_RESPOSTAS_MS - Date.now());
      agendada = setTimeout(() => {
        agendada = null;
        void consultar();
      }, espera);
    }

    recarregarRef.current = consultar;

    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`evento:${eventoId}`)
      .on("broadcast", { event: "aviso" }, ({ payload }) => {
        if (payload?.tipo === "resposta") {
          if (opcoesRef.current.ouvirRespostas) consultarSemPressa();
        } else {
          void consultar();
        }
      })
      .subscribe((status) => {
        // Ao (re)conectar, confere se perdeu algum aviso no caminho.
        if (status === "SUBSCRIBED") void consultar();
      });

    const intervalo = setInterval(() => void consultar(), INTERVALO_MS);
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    const aoVoltarRede = () => void consultar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", aoVoltarRede);

    return () => {
      ativo = false;
      clearInterval(intervalo);
      if (agendada) clearTimeout(agendada);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", aoVoltarRede);
      void supabase.removeChannel(canal);
    };
  }, [url, eventoId]);

  const recarregar = useCallback(() => recarregarRef.current(), []);

  return { dados, semConexao, recarregar };
}
