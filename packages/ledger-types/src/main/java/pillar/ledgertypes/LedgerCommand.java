package pillar.ledgertypes;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Phase 04 mock binding surface used when Daml Java codegen/runtime jars are unavailable.
 * It preserves the command type, package profile, and payload expected by the ledger-command builders.
 */
public final class LedgerCommand {
    private final String commandType;
    private final String templateId;
    private final String choice;
    private final Map<String, Object> arguments;

    private LedgerCommand(String commandType, String templateId, String choice, Map<String, Object> arguments) {
        this.commandType = Objects.requireNonNull(commandType, "commandType");
        this.templateId = Objects.requireNonNull(templateId, "templateId");
        this.choice = Objects.requireNonNull(choice, "choice");
        this.arguments = Collections.unmodifiableMap(new LinkedHashMap<>(Objects.requireNonNull(arguments, "arguments")));
    }

    public static LedgerCommand of(String commandType, String templateId, String choice, Map<String, Object> arguments) {
        return new LedgerCommand(commandType, templateId, choice, arguments);
    }

    public String commandType() { return commandType; }

    public String templateId() { return templateId; }

    public String choice() { return choice; }

    public Map<String, Object> arguments() { return arguments; }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof LedgerCommand that)) return false;
        return commandType.equals(that.commandType)
            && templateId.equals(that.templateId)
            && choice.equals(that.choice)
            && arguments.equals(that.arguments);
    }

    @Override
    public int hashCode() {
        return Objects.hash(commandType, templateId, choice, arguments);
    }

    @Override
    public String toString() {
        return "LedgerCommand{" +
            "commandType='" + commandType + '\'' +
            ", templateId='" + templateId + '\'' +
            ", choice='" + choice + '\'' +
            ", arguments=" + arguments +
            '}';
    }
}
