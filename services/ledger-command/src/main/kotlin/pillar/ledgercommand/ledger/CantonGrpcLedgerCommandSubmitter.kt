package pillar.ledgercommand.ledger

import com.google.protobuf.InvalidProtocolBufferException
import com.google.protobuf.Struct
import com.google.protobuf.Value
import io.grpc.CallOptions
import io.grpc.stub.ClientCalls
import io.grpc.MethodDescriptor
import io.grpc.Status
import io.grpc.StatusRuntimeException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import pillar.ledgercommand.failure.LedgerCommandError
import pillar.ledgertypes.LedgerCommand

class CantonGrpcLedgerCommandSubmitter(
    private val ledgerApiClient: LedgerApiClient,
    private val completionClient: CompletionClient,
    private val actAs: String,
    private val applicationId: String = "pillar-runtime",
) : LedgerCommandSubmitter {
    init {
        require(actAs.isNotBlank()) { "PILLAR_LEDGER_ACT_AS is required when PILLAR_LEDGER_SUBMITTER=grpc" }
        require(applicationId.isNotBlank()) { "PILLAR_LEDGER_APPLICATION_ID must not be blank" }
    }

    override suspend fun submit(commandId: String, submissionId: String, command: LedgerCommand): SubmissionAck =
        withContext(Dispatchers.IO) {
            try {
                val request = SubmitAndWaitForUpdateIdRequest(buildCommands(commandId, submissionId, command))
                submitAndWaitForUpdateId(request)
                SubmissionAck(commandId, submissionId, accepted = true)
            } catch (error: StatusRuntimeException) {
                val mapped = mapGrpcError(error)
                if (mapped is LedgerCommandError.CommandOutcomeUnknown) {
                    val completion = withTimeoutOrNull(5_000) {
                        completionClient.completionsFrom(null)
                            .firstOrNull { it.commandId == commandId && it.submissionId == submissionId }
                    }
                    if (completion?.status == "OK") return@withContext SubmissionAck(commandId, submissionId, accepted = true)
                }
                throw mapped
            }
        }

    private fun buildCommands(commandId: String, submissionId: String, command: LedgerCommand): Commands = Commands(
        applicationId = applicationId,
        commandId = commandId,
        submissionId = submissionId,
        actAs = listOf(actAs),
        payload = commandPayload(command),
    )

    private fun commandPayload(command: LedgerCommand): Struct = Struct.newBuilder()
        .putFields("command_type", Value.newBuilder().setStringValue(command.commandType()).build())
        .putFields("template_id", Value.newBuilder().setStringValue(command.templateId()).build())
        .putFields("choice", Value.newBuilder().setStringValue(command.choice()).build())
        .putFields("arguments", mapValue(command.arguments()))
        .build()

    private fun mapValue(value: Map<String, Any>): Value = Value.newBuilder()
        .setStructValue(Struct.newBuilder().also { builder ->
            value.forEach { (key, item) -> builder.putFields(key, anyValue(item)) }
        })
        .build()

    private fun anyValue(value: Any?): Value = when (value) {
        null -> Value.newBuilder().setNullValue(com.google.protobuf.NullValue.NULL_VALUE).build()
        is String -> Value.newBuilder().setStringValue(value).build()
        is Boolean -> Value.newBuilder().setBoolValue(value).build()
        is Number -> Value.newBuilder().setNumberValue(value.toDouble()).build()
        is Map<*, *> -> mapValue(value.entries.associate { it.key.toString() to (it.value ?: "") })
        else -> Value.newBuilder().setStringValue(value.toString()).build()
    }

    private fun submitAndWaitForUpdateId(request: SubmitAndWaitForUpdateIdRequest): String {
        val call = ledgerApiClient.channel.newCall(SubmitAndWaitForUpdateIdMethod, CallOptions.DEFAULT)
        return ClientCalls.blockingUnaryCall(call, request).updateId
    }

    private fun mapGrpcError(error: StatusRuntimeException): LedgerCommandError = when (error.status.code) {
        Status.Code.UNAVAILABLE, Status.Code.RESOURCE_EXHAUSTED, Status.Code.DEADLINE_EXCEEDED -> LedgerCommandError.ParticipantUnavailable()
        Status.Code.ALREADY_EXISTS -> LedgerCommandError.DuplicateCommand()
        Status.Code.PERMISSION_DENIED, Status.Code.UNAUTHENTICATED -> LedgerCommandError.PartyAuthorizationFailed()
        Status.Code.INVALID_ARGUMENT, Status.Code.FAILED_PRECONDITION -> LedgerCommandError.DamlInterpretationFailed()
        else -> LedgerCommandError.CommandOutcomeUnknown()
    }

    companion object {
        private val SubmitAndWaitForUpdateIdMethod: MethodDescriptor<SubmitAndWaitForUpdateIdRequest, SubmitAndWaitForUpdateIdResponse> =
            MethodDescriptor.newBuilder<SubmitAndWaitForUpdateIdRequest, SubmitAndWaitForUpdateIdResponse>()
                .setType(MethodDescriptor.MethodType.UNARY)
                .setFullMethodName(MethodDescriptor.generateFullMethodName("com.daml.ledger.api.v2.CommandService", "SubmitAndWaitForUpdateId"))
                .setRequestMarshaller(SubmitAndWaitForUpdateIdRequestMarshaller)
                .setResponseMarshaller(SubmitAndWaitForUpdateIdResponseMarshaller)
                .build()
    }
}

data class Commands(
    val applicationId: String,
    val commandId: String,
    val submissionId: String,
    val actAs: List<String>,
    val payload: Struct,
)

data class SubmitAndWaitForUpdateIdRequest(val commands: Commands)
data class SubmitAndWaitForUpdateIdResponse(val updateId: String)

object SubmitAndWaitForUpdateIdRequestMarshaller : MethodDescriptor.Marshaller<SubmitAndWaitForUpdateIdRequest> {
    override fun stream(value: SubmitAndWaitForUpdateIdRequest) = value.toStruct().toByteString().newInput()
    override fun parse(stream: java.io.InputStream): SubmitAndWaitForUpdateIdRequest = SubmitAndWaitForUpdateIdRequest(parseCommands(Struct.parseFrom(stream)))

    private fun SubmitAndWaitForUpdateIdRequest.toStruct(): Struct = Struct.newBuilder()
        .putFields("commands", Value.newBuilder().setStructValue(commands.toStruct()).build())
        .build()

    private fun Commands.toStruct(): Struct = Struct.newBuilder()
        .putFields("application_id", Value.newBuilder().setStringValue(applicationId).build())
        .putFields("command_id", Value.newBuilder().setStringValue(commandId).build())
        .putFields("submission_id", Value.newBuilder().setStringValue(submissionId).build())
        .putFields("act_as", Value.newBuilder().setStringValue(actAs.joinToString(",")).build())
        .putFields("payload", Value.newBuilder().setStructValue(payload).build())
        .build()

    private fun parseCommands(struct: Struct): Commands {
        val commands = struct.fieldsMap["commands"]?.structValue ?: throw InvalidProtocolBufferException("missing commands")
        return Commands(
            applicationId = commands.fieldsMap["application_id"]?.stringValue.orEmpty(),
            commandId = commands.fieldsMap["command_id"]?.stringValue.orEmpty(),
            submissionId = commands.fieldsMap["submission_id"]?.stringValue.orEmpty(),
            actAs = commands.fieldsMap["act_as"]?.stringValue?.split(',')?.filter { it.isNotBlank() }.orEmpty(),
            payload = commands.fieldsMap["payload"]?.structValue ?: Struct.getDefaultInstance(),
        )
    }
}

object SubmitAndWaitForUpdateIdResponseMarshaller : MethodDescriptor.Marshaller<SubmitAndWaitForUpdateIdResponse> {
    override fun stream(value: SubmitAndWaitForUpdateIdResponse) = Struct.newBuilder()
        .putFields("update_id", Value.newBuilder().setStringValue(value.updateId).build())
        .build()
        .toByteString()
        .newInput()

    override fun parse(stream: java.io.InputStream): SubmitAndWaitForUpdateIdResponse = SubmitAndWaitForUpdateIdResponse(
        Struct.parseFrom(stream).fieldsMap["update_id"]?.stringValue.orEmpty(),
    )
}
