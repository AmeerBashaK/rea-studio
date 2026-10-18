// SPDX-License-Identifier: AGPL-3.0-only
// Headless post-script: StudioDecompile.java <hex-address> <output-json>
// Verified with Ghidra 12.1.4; see README for the acceptance scope.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.framework.Application;
import ghidra.program.model.listing.Function;
import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class StudioDecompile extends GhidraScript {
    @Override public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length != 2 || !args[0].matches("(?:0x)?[0-9a-fA-F]{1,16}"))
            throw new IllegalArgumentException("Expected hex address and output JSON path");
        String address = args[0].replaceFirst("^0x", "");
        JsonObject report = new JsonObject();
        report.addProperty("schema", "studio-decompiler/1");
        report.addProperty("engine", "Ghidra");
        report.addProperty("engineVersion", Application.getApplicationVersion());
        report.addProperty("sha256", currentProgram.getExecutableSHA256());
        report.addProperty("address", "0x" + address.toLowerCase());
        report.addProperty("notice", "Ghidra-generated pseudocode; reconstructed logic, not original source.");
        Function function = currentProgram.getFunctionManager().getFunctionAt(toAddr(address));
        DecompInterface decompiler = new DecompInterface();
        try {
            if (function == null) {
                report.addProperty("status", "no-function");
            } else if (!decompiler.openProgram(currentProgram)) {
                report.addProperty("status", "failed");
                report.addProperty("message", String.valueOf(decompiler.getLastMessage()));
            } else {
                DecompileResults result = decompiler.decompileFunction(function, 30, monitor);
                if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
                    report.addProperty("status", result.isTimedOut() ? "timeout" : "failed");
                    report.addProperty("message", String.valueOf(result.getErrorMessage()));
                } else {
                    String code = result.getDecompiledFunction().getC();
                    if (code.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024) {
                        report.addProperty("status", "output-limit");
                    } else {
                        report.addProperty("status", "complete");
                        report.addProperty("message", String.valueOf(result.getErrorMessage()));
                        report.addProperty("name", function.getName());
                        report.addProperty("code", code);
                    }
                }
            }
        } finally {
            decompiler.dispose();
        }
        Files.writeString(Path.of(args[1]), report.toString(), StandardCharsets.UTF_8);
    }
}
