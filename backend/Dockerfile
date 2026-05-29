# syntax=docker/dockerfile:1.7
# Не alpine: protoc из Grpc.Tools слинкован с glibc и не запустится на musl.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/ src/
# csproj ссылается на proto как ../../proto → /src/proto.
COPY proto/ proto/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish src/AiMedincident.Backend/AiMedincident.Backend.csproj \
      -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl

ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    HTTP_ADDR=:8080

COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "AiMedincident.Backend.dll"]
