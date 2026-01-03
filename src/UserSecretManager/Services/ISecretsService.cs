using UserSecretManager.Models;

namespace UserSecretManager.Services;

/// <summary>
/// Interface for loading and saving User Secrets.
/// </summary>
public interface ISecretsService
{
    /// <summary>
    /// Loads the secrets content for a project.
    /// </summary>
    Task<ProjectSecrets> LoadSecretsAsync(ProjectInfo project, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Saves the secrets content for a project.
    /// </summary>
    Task SaveSecretsAsync(ProjectSecrets secrets, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Validates JSON content.
    /// </summary>
    (bool IsValid, string? Error) ValidateJson(string content);
    
    /// <summary>
    /// Formats/prettifies JSON content.
    /// </summary>
    string FormatJson(string content);
}
