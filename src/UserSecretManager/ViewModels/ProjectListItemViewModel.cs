using CommunityToolkit.Mvvm.ComponentModel;
using UserSecretManager.Models;

namespace UserSecretManager.ViewModels;

/// <summary>
/// ViewModel for a project item in the sidebar list.
/// </summary>
public partial class ProjectListItemViewModel : ViewModelBase
{
    public ProjectInfo Project { get; }

    [ObservableProperty]
    private bool _isVisible = true;

    public string Name => Project.Name;
    public string UserSecretsId => Project.UserSecretsId;
    public string ProjectPath => Project.ProjectPath;
    public bool SecretsFileExists => Project.SecretsFileExists;

    public ProjectListItemViewModel(ProjectInfo project)
    {
        Project = project;
    }
}
