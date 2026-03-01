{{- define "game-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "game-app.fullname" -}}
{{- printf "%s-%s" (include "game-app.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
