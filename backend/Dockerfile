FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY src/AiMedincident.Backend/AiMedincident.Backend.csproj src/AiMedincident.Backend/
RUN dotnet restore src/AiMedincident.Backend/AiMedincident.Backend.csproj

COPY src/ src/
RUN dotnet publish src/AiMedincident.Backend/AiMedincident.Backend.csproj \
      -c Release -o /app/publish \
      /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl

ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    HTTP_ADDR=:8080

COPY --from=build /app/publish .
USER app

ENTRYPOINT ["dotnet", "AiMedincident.Backend.dll"]
