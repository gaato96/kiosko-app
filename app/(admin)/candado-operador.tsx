"use client";

/**
 * El candado del admin cuando en el mostrador hay un empleado.
 *
 * EL AGUJERO QUE TAPA. La tablet del kiosco se abre una vez, con la cuenta del
 * dueño, y queda prendida todo el día. Quien atiende se identifica con un PIN,
 * pero ese PIN no cambia la sesión HTTP: sigue siendo la del dueño. Resultado:
 * el empleado que entró con PIN podía tocar "ir al panel" y ver los costos,
 * los márgenes, la ganancia y las diferencias de caja de sus compañeros.
 *
 * El middleware no lo puede frenar porque del lado del servidor la petición
 * llega firmada por el dueño, y RLS tampoco: para la base, es el dueño.
 *
 * Por eso el candado es el PIN, que es lo único capaz de volver a probar quién
 * está parado frente a la pantalla. Acertarlo devuelve el mostrador al dueño,
 * que es exactamente lo que pasó en la vida real cuando volvió a agarrar la
 * tablet.
 *
 * Esto NO reemplaza a RLS: si al empleado se le da una cuenta propia —que es
 * como corresponde— el corte real lo hace el servidor y esta pantalla ni
 * aparece. Esto cubre el caso del mostrador compartido.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { IngresoPin } from "@/components/pos/pin";
import { Boton } from "@/components/ui/boton";
import { operadoresCacheados, validarPinDueno, type OperadorCacheado } from "@/lib/db/operadores";
import { usarSesion } from "@/lib/store/sesion";

export function CandadoOperador({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const operador = usarSesion((s) => s.operador);
  const definirOperador = usarSesion((s) => s.definirOperador);

  const [duenos, setDuenos] = useState<OperadorCacheado[]>([]);
  const [elegido, setElegido] = useState<OperadorCacheado | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El store se rehidrata un tick después del primer render (skipHydration en
  // lib/store/sesion.ts). Hasta que eso pase `operador` es null y no hay que
  // trabar nada: trabar de más mandaría al dueño a poner el PIN en cada carga.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    void Promise.resolve(usarSesion.persist.rehydrate()).finally(() => setListo(true));
  }, []);

  const trabado = listo && operador != null && operador.rol !== "dueno";

  useEffect(() => {
    if (!trabado) return;
    void operadoresCacheados().then((todos) => {
      const soloDuenos = todos.filter((u) => u.rol === "dueno");
      setDuenos(soloDuenos);
      // Con un solo dueño no se le pregunta a quién: se le pide el PIN y listo.
      if (soloDuenos.length === 1) setElegido(soloDuenos[0] ?? null);
    });
  }, [trabado]);

  if (!trabado) return <>{children}</>;

  async function confirmar(pin: string) {
    const dueno = elegido;
    if (!dueno) return;

    const r = await validarPinDueno(dueno.id, pin);
    if (!r.ok) {
      setError(
        r.offline
          ? "Sin conexión no se puede verificar el PIN. Entrá desde otro dispositivo con red."
          : "Ese PIN no es correcto.",
      );
      return;
    }

    // El dueño volvió a agarrar la tablet: el mostrador vuelve a ser suyo.
    definirOperador({ id: dueno.id, nombre: dueno.nombre, rol: "dueno" });
    setError(null);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="tarjeta flex w-full max-w-md flex-col items-center gap-5 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-text-muted">
          <ShieldCheck size={26} aria-hidden />
        </span>

        <div>
          <h1 className="font-display text-xl font-bold">Esta parte es del dueño</h1>
          <p className="mt-1.5 text-text-muted">
            En el mostrador está <strong className="text-text">{operador?.nombre}</strong>. Si sos
            el dueño, poné tu PIN para entrar.
          </p>
        </div>

        {duenos.length === 0 ? (
          <p className="text-sm text-warning">
            Este dispositivo no tiene ningún dueño guardado. Cerrá sesión y volvé a entrar con la
            cuenta del dueño.
          </p>
        ) : elegido ? (
          <IngresoPin
            titulo={duenos.length > 1 ? `PIN de ${elegido.nombre}` : "PIN del dueño"}
            onCompleto={(pin) => void confirmar(pin)}
            error={error}
          />
        ) : (
          // Con más de un dueño hay que saber de quién es el PIN que se está
          // por comparar: probar contra todos sería un oráculo de PINes.
          <div className="flex w-full flex-col gap-2">
            <p className="rotulo">¿Quién sos?</p>
            {duenos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setElegido(d)}
                className="presion flex min-h-14 items-center rounded-[var(--radio)] border border-border bg-surface px-4 font-semibold hover:border-border-fuerte"
              >
                {d.nombre}
              </button>
            ))}
          </div>
        )}

        <Boton variante="fantasma" onClick={() => router.push("/pos")}>
          <ArrowLeft size={17} /> Volver a cobrar
        </Boton>
      </div>
    </div>
  );
}
