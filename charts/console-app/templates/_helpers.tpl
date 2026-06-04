{{- define "console-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "console-app.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "console-app.name" . -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "console-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "console-app.labels" -}}
helm.sh/chart: {{ include "console-app.chart" . }}
{{ include "console-app.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{- define "console-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "console-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "console-app.nginxConfigName" -}}
{{- printf "%s-nginx" (include "service-base.fullname" .) -}}
{{- end -}}

{{- define "console-app.envValue" -}}
{{- tpl (toString .value) .context -}}
{{- end -}}

{{- define "console-app.render" -}}
{{- $template := .template -}}
{{- $root := .context -}}
{{- $values := deepCopy $root.Values -}}
{{- $env := list -}}
{{- range $envVar := $values.env | default (list) -}}
  {{- $renderedEnvVar := deepCopy $envVar -}}
  {{- if hasKey $renderedEnvVar "value" -}}
    {{- $_ := set $renderedEnvVar "value" (include "console-app.envValue" (dict "value" (get $renderedEnvVar "value") "context" $root)) -}}
  {{- end -}}
  {{- $env = append $env $renderedEnvVar -}}
{{- end -}}
{{- $values = set $values "env" $env -}}
{{- $nginx := $values.nginx | default (dict) -}}
{{- $config := $nginx.config | default (dict) -}}
{{- if ($config.enabled | default false) -}}
  {{- $mount := dict "name" "nginx-template" "sourceName" (include "console-app.nginxConfigName" $root) "type" "configMap" "mountPath" "/etc/nginx/templates/default.conf.template" "subPath" "default.conf.template" "readOnly" true -}}
  {{- $mounts := $values.configMounts | default (list) -}}
  {{- $mounts = append $mounts $mount -}}
  {{- $values = set $values "configMounts" $mounts -}}
{{- end -}}
{{- $ctx := dict "Values" $values "Chart" $root.Chart "Capabilities" $root.Capabilities "Release" $root.Release "Files" $root.Files "Template" $root.Template -}}
{{- include $template $ctx -}}
{{- end -}}
