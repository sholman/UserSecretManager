using System.Text.Json;
using UserSecretManager.Models;

namespace UserSecretManager.Services;

/// <summary>
/// Service for loading and saving User Secrets.
/// </summary>
public class SecretsService : ISecretsService
{
    private static readonly JsonSerializerOptions PrettyPrintOptions = new()
    {
        WriteIndented = true
    };

    /// <inheritdoc />
    public async Task<ProjectSecrets> LoadSecretsAsync(
        ProjectInfo project,
        CancellationToken cancellationToken = default)
    {
        var secrets = new ProjectSecrets
        {
            Project = project
        };

        if (!File.Exists(project.SecretsFilePath))
        {
            secrets.Content = "{\n  \n}";
            secrets.IsValidJson = true;
            return secrets;
        }

        try
        {
            secrets.Content = await File.ReadAllTextAsync(project.SecretsFilePath, cancellationToken);
            secrets.LastModified = File.GetLastWriteTime(project.SecretsFilePath);
            
            var (isValid, error) = ValidateJson(secrets.Content);
            secrets.IsValidJson = isValid;
            secrets.ValidationError = error;
        }
        catch (Exception ex)
        {
            secrets.Content = $"// Error loading file: {ex.Message}";
            secrets.IsValidJson = false;
            secrets.ValidationError = ex.Message;
        }

        return secrets;
    }

    /// <inheritdoc />
    public async Task SaveSecretsAsync(
        ProjectSecrets secrets,
        CancellationToken cancellationToken = default)
    {
        var (isValid, error) = ValidateJson(secrets.Content);
        if (!isValid)
        {
            throw new InvalidOperationException($"Cannot save invalid JSON: {error}");
        }

        // Ensure directory exists
        var directory = Path.GetDirectoryName(secrets.Project.SecretsFilePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllTextAsync(
            secrets.Project.SecretsFilePath,
            secrets.Content,
            cancellationToken);

        secrets.IsDirty = false;
        secrets.LastModified = DateTime.Now;
    }

    /// <inheritdoc />
    public (bool IsValid, string? Error) ValidateJson(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return (false, "Content is empty");
        }

        try
        {
            using var doc = JsonDocument.Parse(content);
            return (true, null);
        }
        catch (JsonException ex)
        {
            return (false, ex.Message);
        }
    }

    /// <inheritdoc />
    public string FormatJson(string content)
    {
        try
        {
            using var doc = JsonDocument.Parse(content);
            return JsonSerializer.Serialize(doc.RootElement, PrettyPrintOptions);
        }
        catch
        {
            return content; // Return original if parsing fails
        }
    }
}
