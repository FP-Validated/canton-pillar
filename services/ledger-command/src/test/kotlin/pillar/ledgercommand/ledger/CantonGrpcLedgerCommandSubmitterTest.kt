package pillar.ledgercommand.ledger

import io.grpc.BindableService
import io.grpc.ManagedChannel
import io.grpc.ServerServiceDefinition
import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder
import io.grpc.netty.shaded.io.grpc.netty.NettyServerBuilder
import io.grpc.stub.ServerCalls
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import pillar.ledgercommand.failure.LedgerCommandError
import pillar.ledgertypes.LedgerCommand

class CantonGrpcLedgerCommandSubmitterTest {
    private var channel: ManagedChannel? = null
    private var server: io.grpc.Server? = null

    @AfterEach
    fun tearDown() {
        channel?.shutdownNow()
        server?.shutdownNow()
    }

    @Test
    fun `happy path returns accepted submission ack`() = runBlocking {
        val service = commandService { request ->
            assertEquals("cmd_1", request.commands.commandId)
            assertEquals("sub_1", request.commands.submissionId)
            assertEquals(listOf("Alice"), request.commands.actAs)
            SubmitAndWaitForUpdateIdResponse("upd_1")
        }
        val submitter = submitter(service)

        val ack = submitter.submit("cmd_1", "sub_1", command())

        assertTrue(ack.accepted)
        assertEquals("cmd_1", ack.commandId)
        assertEquals("sub_1", ack.submissionId)
    }

    @Test
    fun `unavailable maps to retryable ledger command error`() = runBlocking {
        val submitter = submitter(commandService { throw StatusRuntimeException(Status.UNAVAILABLE) })

        val error = assertThrows<LedgerCommandError.ParticipantUnavailable> {
            runBlocking { submitter.submit("cmd_2", "sub_2", command()) }
        }

        assertEquals("participant_unavailable", error.message)
    }

    private fun submitter(service: BindableService): CantonGrpcLedgerCommandSubmitter {
        server = NettyServerBuilder.forPort(0).directExecutor().addService(service).build().start()
        channel = NettyChannelBuilder.forAddress("localhost", server!!.port).usePlaintext().directExecutor().build()
        val client = LedgerApiClient("localhost", server!!.port)
        return CantonGrpcLedgerCommandSubmitter(client, EmptyCompletionClient(), "Alice", "pillar-runtime")
    }


    private fun commandService(handler: (SubmitAndWaitForUpdateIdRequest) -> SubmitAndWaitForUpdateIdResponse): BindableService = BindableService {
        ServerServiceDefinition.builder("com.daml.ledger.api.v2.CommandService")
            .addMethod(
                io.grpc.MethodDescriptor.newBuilder<SubmitAndWaitForUpdateIdRequest, SubmitAndWaitForUpdateIdResponse>()
                    .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
                    .setFullMethodName(io.grpc.MethodDescriptor.generateFullMethodName("com.daml.ledger.api.v2.CommandService", "SubmitAndWaitForUpdateId"))
                    .setRequestMarshaller(SubmitAndWaitForUpdateIdRequestMarshaller)
                    .setResponseMarshaller(SubmitAndWaitForUpdateIdResponseMarshaller)
                    .build(),
                ServerCalls.asyncUnaryCall { request, observer ->
                    try {
                        observer.onNext(handler(request))
                        observer.onCompleted()
                    } catch (error: StatusRuntimeException) {
                        observer.onError(error)
                    }
                },
            )
            .build()
    }

    private fun command(): LedgerCommand = LedgerCommand.of(
        "issue",
        "pkg:Module:Template",
        "Create",
        mapOf("amount" to "10.0", "issuer" to "Alice"),
    )
}
