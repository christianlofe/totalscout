import { useState } from "react"
import { supabase } from "./supabase"

export default function App() {
  const [pantalla, setPantalla] = useState("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [club, setClub] = useState(null)
  const [partido, setPartido] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [eventos, setEventos] = useState([])
  const [jugadorSel, setJugadorSel] = useState(null)
  const [rival, setRival] = useState("")
  const [cargando, setCargando] = useState(false)
  const [tabActiva, setTabActiva] = useState("local")
  const [jugadoresRival, setJugadoresRival] = useState([])
  const [jugadorRivalSel, setJugadorRivalSel] = useState(null)
  const [nuevoRival, setNuevoRival] = useState("")
  const [eventosRival, setEventosRival] = useState([])

  const EVENTOS = [
    { tipo: "gol", label: "⚽ Gol", color: "bg-green-500" },
    { tipo: "gol_encajado", label: "🧤 Encajado", color: "bg-orange-500" },
    { tipo: "amarilla", label: "🟨 Amarilla", color: "bg-yellow-400" },
    { tipo: "roja", label: "🟥 Roja", color: "bg-red-500" },
    { tipo: "falta", label: "👟 Falta", color: "bg-gray-500" },
    { tipo: "corner", label: "🔵 Corner", color: "bg-blue-500" },
    { tipo: "penalti", label: "🎯 Penalti", color: "bg-purple-500" },
    { tipo: "tiro_fallado", label: "❌ Tiro Fallado", color: "bg-gray-400" },
  ]

  async function handleLogin() {
    setError("")
    setCargando(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", data.user.id).single()
      if (perfil?.rol !== "delegado") {
        setError("❌ Solo pueden acceder delegados.")
        await supabase.auth.signOut()
        setCargando(false)
        return
      }

      const { data: clubData } = await supabase.from("clubes").select("*").eq("id", perfil.club_id).single()
      setClub(clubData)

      const { data: partidoActivo } = await supabase.from("partidos")
        .select("*")
        .eq("club_local_id", clubData.id)
        .eq("estado", "en_curso")
        .maybeSingle()

      if (partidoActivo) {
        setPartido(partidoActivo)
        await cargarJugadores(clubData.id)
        await cargarEventos(partidoActivo.id)
        setPantalla("acta")
      } else {
        setPantalla("iniciar")
      }
    } catch (e) {
      setError("❌ Email o contraseña incorrectos.")
    }
    setCargando(false)
  }

  async function cargarJugadores(clubId) {
    const { data } = await supabase.from("jugadores").select("id, nombre, posicion").eq("club_id", clubId)
    setJugadores(data || [])
    if (data?.length > 0) setJugadorSel(data[0])
  }

  async function cargarEventos(partidoId) {
    const { data: local } = await supabase.from("acta_eventos").select("*").eq("partido_id", partidoId).eq("equipo", "local")
    setEventos(local || [])
    const { data: rivalData } = await supabase.from("acta_eventos").select("*").eq("partido_id", partidoId).eq("equipo", "rival")
    setEventosRival(rivalData || [])
    const { data: jRival } = await supabase.from("jugadores_rivales").select("*").eq("partido_id", partidoId)
    setJugadoresRival(jRival || [])
    if (jRival?.length > 0) setJugadorRivalSel(jRival[0])
  }

  async function iniciarPartido() {
    if (!rival.trim()) return
    setCargando(true)
    const { data } = await supabase.from("partidos").insert({
      club_local_id: club.id,
      nombre_rival: rival,
      fecha: new Date().toISOString().split("T")[0],
      estado: "en_curso",
      goles_local: 0,
      goles_rival: 0
    }).select().single()
    setPartido(data)
    await cargarJugadores(club.id)
    setPantalla("acta")
    setCargando(false)
  }

  async function registrarEvento(tipo) {
    if (!jugadorSel) return
    const esEncajado = tipo === "gol_encajado"
    if (esEncajado && jugadorSel.posicion?.toLowerCase() !== "portero") return

    await supabase.from("acta_eventos").insert({
      partido_id: partido.id,
      jugador_id: jugadorSel.id,
      equipo: "local",
      tipo,
    })

    if (tipo === "gol") {
      const nuevosMarcador = partido.goles_local + 1
      await supabase.from("partidos").update({ goles_local: nuevosMarcador }).eq("id", partido.id)
      const { data: partidoActualizado } = await supabase.from("partidos").select("*").eq("id", partido.id).single()
      setPartido(partidoActualizado)
    }

    await cargarEventos(partido.id)
  }

  async function registrarEventoRival(tipo) {
    if (!jugadorRivalSel) return

    await supabase.from("acta_eventos").insert({
      partido_id: partido.id,
      jugador_rival_nombre: jugadorRivalSel.nombre,
      equipo: "rival",
      tipo,
    })

    if (tipo === "gol") {
      const nuevosMarcador = partido.goles_rival + 1
      await supabase.from("partidos").update({ goles_rival: nuevosMarcador }).eq("id", partido.id)
      setPartido(p => ({ ...p, goles_rival: nuevosMarcador }))
    }

    await cargarEventos(partido.id)
    
    const { data: partidoFresh } = await supabase.from("partidos").select("*").eq("id", partido.id).single()
    setPartido(partidoFresh)
  }

  async function deshacerUltimoEvento() {
    if (eventos.length === 0) return
    const ultimo = eventos[eventos.length - 1]
    await supabase.from("acta_eventos").delete().eq("id", ultimo.id)
    if (ultimo.tipo === "gol") {
      const nuevosMarcador = Math.max(0, partido.goles_local - 1)
      await supabase.from("partidos").update({ goles_local: nuevosMarcador }).eq("id", partido.id)
      setPartido(p => ({ ...p, goles_local: nuevosMarcador }))
    }
    await cargarEventos(partido.id)
  }

  async function finalizarPartido() {
    if (!window.confirm("¿Finalizar el partido y enviar estadísticas?")) return
    setCargando(true)

    const stats = {}
    for (const e of eventos) {
      if (!e.jugador_id) continue
      if (!stats[e.jugador_id]) stats[e.jugador_id] = { goles: 0, goles_encajados: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0 }
      if (e.tipo === "gol") stats[e.jugador_id].goles++
      if (e.tipo === "gol_encajado") stats[e.jugador_id].goles_encajados++
      if (e.tipo === "amarilla") stats[e.jugador_id].tarjetas_amarillas++
      if (e.tipo === "roja") stats[e.jugador_id].tarjetas_rojas++
    }

    for (const [jid, s] of Object.entries(stats)) {
      const { data: j } = await supabase.from("jugadores").select("goles, goles_encajados, tarjetas_amarillas, tarjetas_rojas").eq("id", jid).single()
      await supabase.from("jugadores").update({
        goles: (j.goles || 0) + s.goles,
        goles_encajados: (j.goles_encajados || 0) + s.goles_encajados,
        tarjetas_amarillas: (j.tarjetas_amarillas || 0) + s.tarjetas_amarillas,
        tarjetas_rojas: (j.tarjetas_rojas || 0) + s.tarjetas_rojas,
      }).eq("id", jid)
    }

    for (const j of jugadores) {
      const { data } = await supabase.from("jugadores").select("partidos_jugados").eq("id", j.id).single()
      await supabase.from("jugadores").update({ partidos_jugados: (data.partidos_jugados || 0) + 1 }).eq("id", j.id)
    }

    await supabase.from("partidos").update({ estado: "finalizado" }).eq("id", partido.id)

    setPartido(null)
    setEventos([])
    setEventosRival([])
    setJugadoresRival([])
    setPantalla("finalizado")
    setCargando(false)
  }

  // ── LOGIN ──
  if (pantalla === "login") return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-white text-2xl font-bold">TotalScout</h1>
          <p className="text-gray-400 text-sm mt-1">Portal del Delegado</p>
        </div>
        {error && <div className="bg-red-900 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}
        <input className="w-full bg-gray-700 text-white rounded-xl p-4 mb-3 text-lg outline-none" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full bg-gray-700 text-white rounded-xl p-4 mb-6 text-lg outline-none" type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={handleLogin} disabled={cargando} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-lg transition">
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  )

  // ── INICIAR PARTIDO ──
  if (pantalla === "iniciar") return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <h2 className="text-white text-xl font-bold mb-2">🏟️ Nuevo Partido</h2>
        <p className="text-green-400 text-sm mb-6">{club?.nombre}</p>
        <input className="w-full bg-gray-700 text-white rounded-xl p-4 mb-6 text-lg outline-none" placeholder="Nombre del equipo rival" value={rival} onChange={e => setRival(e.target.value)} />
        <button onClick={iniciarPartido} disabled={cargando || !rival.trim()} className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white font-bold py-4 rounded-xl text-lg transition">
          {cargando ? "Iniciando..." : "▶️ Iniciar Partido"}
        </button>
      </div>
    </div>
  )

  // ── ACTA ──
  if (pantalla === "acta") return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* MARCADOR */}
      <div className="bg-gray-800 p-4 text-center border-b border-gray-700">
        <p className="text-gray-400 text-xs mb-1">{club?.nombre}</p>
        <div className="flex items-center justify-center gap-6">
          <span className="text-4xl font-bold text-green-400">{partido?.goles_local ?? 0}</span>
          <span className="text-gray-500 text-2xl">—</span>
          <span className="text-4xl font-bold text-red-400">{partido?.goles_rival ?? 0}</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">{partido?.nombre_rival}</p>
      </div>

      {/* TABS */}
      <div className="flex border-b border-gray-700">
        <button onClick={() => setTabActiva("local")} className={`flex-1 py-3 font-bold text-sm transition ${tabActiva === "local" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400"}`}>
          🏠 Mi Equipo
        </button>
        <button onClick={() => setTabActiva("rival")} className={`flex-1 py-3 font-bold text-sm transition ${tabActiva === "rival" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"}`}>
          ✈️ Rival
        </button>
      </div>

      {/* TAB MI EQUIPO */}
      {tabActiva === "local" && (
        <div>
          <div className="p-4 bg-gray-800 border-b border-gray-700">
            <p className="text-gray-400 text-xs mb-2">JUGADOR ACTIVO</p>
            <select className="w-full bg-gray-700 text-white rounded-xl p-3 text-base" value={jugadorSel?.id || ""} onChange={e => setJugadorSel(jugadores.find(j => j.id === parseInt(e.target.value)))}>
              {jugadores.map(j => (
                <option key={j.id} value={j.id}>{j.nombre} — {j.posicion}</option>
              ))}
            </select>
          </div>

          <div className="p-4 grid grid-cols-2 gap-3">
            {EVENTOS.map(ev => {
              const soloPortero = ev.tipo === "gol_encajado"
              const esPortero = jugadorSel?.posicion?.toLowerCase() === "portero"
              if (soloPortero && !esPortero) return null
              return (
                <button key={ev.tipo} onClick={() => registrarEvento(ev.tipo)} className={`${ev.color} text-white font-bold py-5 rounded-2xl text-lg shadow-lg active:scale-95 transition`}>
                  {ev.label}
                </button>
              )
            })}
          </div>

          <div className="px-4 pb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-400 text-xs">EVENTOS ({eventos.length})</p>
              {eventos.length > 0 && (
                <button onClick={deshacerUltimoEvento} className="text-red-400 text-xs font-bold">↩ Deshacer</button>
              )}
            </div>
            <div className="bg-gray-800 rounded-xl p-3 max-h-40 overflow-y-auto">
              {eventos.length === 0 && <p className="text-gray-500 text-sm text-center">Sin eventos aún</p>}
              {[...eventos].reverse().map((e, i) => {
                const j = jugadores.find(j => j.id === e.jugador_id)
                const ev = EVENTOS.find(ev => ev.tipo === e.tipo)
                return (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-0">
                    <span>{ev?.label || e.tipo}</span>
                    <span className="text-gray-400">{j?.nombre || "—"}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB RIVAL */}
      {tabActiva === "rival" && (
        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <input className="flex-1 bg-gray-700 text-white rounded-xl p-3 text-base outline-none" placeholder="Nombre jugador rival" value={nuevoRival} onChange={e => setNuevoRival(e.target.value)} />
            <button
              onClick={async () => {
                if (!nuevoRival.trim()) return
                await supabase.from("jugadores_rivales").insert({ nombre: nuevoRival, partido_id: partido.id })
                setNuevoRival("")
                await cargarEventos(partido.id)
              }}
              className="bg-green-500 text-white font-bold px-4 rounded-xl"
            >
              ➕
            </button>
          </div>

          {jugadoresRival.length === 0 && (
            <p className="text-gray-500 text-center text-sm mt-8">Añade jugadores del equipo rival para registrar sus eventos</p>
          )}

          {jugadoresRival.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-2">JUGADOR RIVAL ACTIVO</p>
              <select className="w-full bg-gray-700 text-white rounded-xl p-3 text-base mb-4" value={jugadorRivalSel?.id || ""} onChange={e => setJugadorRivalSel(jugadoresRival.find(j => j.id === parseInt(e.target.value)))}>
                {jugadoresRival.map(j => (
                  <option key={j.id} value={j.id}>{j.nombre}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3">
                {EVENTOS.filter(ev => ev.tipo !== "gol_encajado").map(ev => (
                  <button key={ev.tipo} onClick={() => registrarEventoRival(ev.tipo)} className={`${ev.color} text-white font-bold py-5 rounded-2xl text-lg shadow-lg active:scale-95 transition`}>
                    {ev.label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-gray-400 text-xs mb-2">EVENTOS RIVAL ({eventosRival.length})</p>
                <div className="bg-gray-800 rounded-xl p-3 max-h-40 overflow-y-auto">
                  {eventosRival.length === 0 && <p className="text-gray-500 text-sm text-center">Sin eventos aún</p>}
                  {[...eventosRival].reverse().map((e, i) => {
                    const ev = EVENTOS.find(ev => ev.tipo === e.tipo)
                    return (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-0">
                        <span>{ev?.label || e.tipo}</span>
                        <span className="text-gray-400">{e.jugador_rival_nombre || "—"}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTÓN FINALIZAR */}
      <div className="px-4 pb-8 mt-4">
        <button onClick={finalizarPartido} disabled={cargando} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-5 rounded-2xl text-xl shadow-lg">
          {cargando ? "Guardando..." : "🏁 Finalizar Partido"}
        </button>
      </div>
    </div>
  )

  // ── FINALIZADO ──
  if (pantalla === "finalizado") return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm text-center shadow-xl">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-white text-2xl font-bold mb-2">¡Partido Finalizado!</h2>
        <p className="text-gray-400 mb-8">Las estadísticas se han actualizado correctamente.</p>
        <button onClick={() => { setRival(""); setPantalla("iniciar") }} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-lg">
          Nuevo Partido
        </button>
      </div>
    </div>
  )
}
