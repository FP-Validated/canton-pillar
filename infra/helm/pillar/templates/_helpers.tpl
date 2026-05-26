{{- define "pillar.name" -}}pillar{{- end -}}
{{- define "pillar.fullname" -}}{{ printf "%s-%s" .Release.Name (include "pillar.name" .) | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- define "pillar.labels" -}}
app.kubernetes.io/name: {{ include "pillar.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
pillar.canton/release: {{ .Values.release | quote }}
pillar.canton/deploymentMode: {{ .Values.deploymentMode | quote }}
pillar.canton/environment: {{ .Values.environment | quote }}
{{- end -}}
{{- define "pillar.componentLabels" -}}
{{ include "pillar.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}
{{- define "pillar.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pillar.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}
{{- define "pillar.image" -}}{{- $svc := index .root.Values .component -}}{{- if $svc.image.digest -}}{{ printf "%s@%s" $svc.image.repository $svc.image.digest }}{{- else -}}{{ printf "%s:%s" $svc.image.repository ($svc.image.tag | default "dev") }}{{- end -}}{{- end -}}
