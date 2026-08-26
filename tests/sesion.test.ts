import { describe, expect, it } from "vitest";
import { rolEnMostrador } from "@/lib/store/sesion";

/**
 * El caso real: la tablet del kiosco se abre UNA vez con la cuenta del dueño y
 * queda prendida todo el día. Quien atiende se identifica con su PIN. Si la
 * app decide qué mostrar mirando solamente la cuenta, el empleado que entró
 * con PIN sigue teniendo a mano el panel, los costos y los márgenes.
 */
describe("rolEnMostrador", () => {
  const dueno = { id: "d1", nombre: "Marcela", rol: "dueno" as const };
  const empleado = { id: "e1", nombre: "Gastón", rol: "empleado" as const };

  it("sin operador manda el rol de la cuenta", () => {
    expect(rolEnMostrador({ rolCuenta: "dueno", operador: null })).toBe("dueno");
    expect(rolEnMostrador({ rolCuenta: "empleado", operador: null })).toBe("empleado");
  });

  it("un empleado con PIN sobre la sesión del dueño cuenta como empleado", () => {
    expect(rolEnMostrador({ rolCuenta: "dueno", operador: empleado })).toBe("empleado");
  });

  it("el dueño que vuelve a agarrar la tablet recupera su rol", () => {
    expect(rolEnMostrador({ rolCuenta: "dueno", operador: dueno })).toBe("dueno");
  });

  /**
   * Al revés no aplica: un operador marcado como dueño sobre una cuenta de
   * empleado no puede ascender a nadie, porque RLS sigue viendo la cuenta de
   * empleado y le va a negar los datos igual. Acá el valor solo decide qué se
   * dibuja; el corte de verdad lo hace el servidor.
   */
  it("no sirve para subir de rol: el servidor sigue mandando", () => {
    expect(rolEnMostrador({ rolCuenta: "empleado", operador: dueno })).toBe("dueno");
  });

  it("una sesión anónima sin operador sigue siendo anónima", () => {
    expect(rolEnMostrador({ rolCuenta: "anon", operador: null })).toBe("anon");
  });
});
