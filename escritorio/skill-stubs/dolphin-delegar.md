# Dolphin: delegar las tareas

This discovery stub loads the version-matched guide from the Dolphin executable used for this session.

Dentro de Dolphin, «delegá las tareas», «repartí», «usá subagentes» o «en paralelo» quiere decir:
partir el pedido y lanzar cada tarea como un agente de Dolphin que la persona ve en su propia
pestaña (`DOLPHIN orchestration worker-start --spec-file - --task-title "<título>" --agent <motor>
--keep-open`), una por tarea, y terminar el turno hasta que reporten. Nunca tu herramienta interna
de subagentes ni un plugin que corra otro motor por fuera de Dolphin: la persona no los ve. Nunca
con los permisos salteados si la persona no lo pidió.

<!-- shared: resolver -->

## Load the version-matched guide before running Dolphin commands

```text
DOLPHIN skills get dolphin-delegar
```

It covers splitting the request, checking which agents are installed (`DOLPHIN agent list`),
where each one works, launching them, telling the user where to watch, and collecting results.

<!-- shared: no-guessing -->
